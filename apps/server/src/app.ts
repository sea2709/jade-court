/**
 * Hono app (REST routes) and the room WebSocket server.
 * Kept free of `listen()` and env loading so tests can import it directly.
 */
import { Hono, type Context } from 'hono';
import type Stripe from 'stripe';
import { cors } from 'hono/cors';
import type { Server } from 'http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import type { Move, Side } from '@jade-court/xiangqi-engine';
import { saveFinishedGame } from './db.js';
import { createAuthMiddleware, getGuestId } from './middleware/auth.js';
import { createEmailSender } from './email/createEmailSender.js';
import type { EmailSender } from './email/types.js';
import { MemoryEmailTokenStore } from './emailTokens/memoryStore.js';
import { MongoEmailTokenStore } from './emailTokens/mongoStore.js';
import type { EmailTokenStore } from './emailTokens/store.js';
import { createMeRoute, createPlayerAuthRoutes } from './routes/auth.js';
import { MemorySessionStore } from './users/memorySessionStore.js';
import { MemoryUserStore } from './users/memoryStore.js';
import { MongoSessionStore } from './users/mongoSessionStore.js';
import { MongoUserStore } from './users/mongoStore.js';
import type { SessionStore } from './users/sessionStore.js';
import type { UserStore } from './users/store.js';
import {
  addChatEntry,
  chatRateLimiter,
  newSystemEntry,
  postPlayerChat,
  type ChatEntry,
} from './chat.js';
import {
  applyRoomMove,
  createRoom,
  getRoom,
  joinRoom,
  parseDisplayNameField,
  publicRoomView,
  resignRoom,
  seatFor,
  type RoomState,
} from './rooms.js';
import { createAiRoutes } from './routes/ai.js';
import { createCoachRoutes } from './routes/coach.js';
import engineRoutes from './routes/engine.js';
import opponentRoutes from './routes/opponent.js';
import { createAdminRoutes } from './routes/admin.js';
import { createAdminNewsRoutes } from './routes/adminNews.js';
import { createNewsRoutes } from './routes/news.js';
import {
  defaultNewsImageDir,
  DiskNewsImageStorage,
  type NewsImageStorage,
} from './news/imageStorage.js';
import { MongoNewsStore } from './news/mongoStore.js';
import type { NewsStore } from './news/store.js';
import { MemoryPaymentStore } from './billing/payments/memoryStore.js';
import { MongoPaymentStore } from './billing/payments/mongoStore.js';
import type { PaymentStore } from './billing/payments/store.js';
import { createBillingRoutes } from './routes/billing.js';
import { MemorySavedGameStore } from './games/memoryStore.js';
import { MongoSavedGameStore } from './games/mongoStore.js';
import type { SavedGameStore } from './games/store.js';
import { createGamesRoutes } from './routes/games.js';

/** Open room sockets, shared by REST joins and WebSocket messages for broadcasts. */
const sockets = new Map<WebSocket, { guestId: string; code?: string }>();

function broadcastRoom(room: RoomState) {
  const payload = JSON.stringify({ type: 'room', room: publicRoomView(room) });
  for (const [ws, meta] of sockets) {
    if (meta.code === room.code && ws.readyState === ws.OPEN) ws.send(payload);
  }
}

function broadcastChatToPlayers(room: RoomState, message: ChatEntry) {
  const payload = JSON.stringify({ type: 'chat', message });
  for (const [ws, meta] of sockets) {
    if (meta.code !== room.code || ws.readyState !== ws.OPEN) continue;
    if (!seatFor(room, meta.guestId)) continue;
    ws.send(payload);
  }
}

function appendAndBroadcastSystem(
  room: RoomState,
  event: 'joined' | 'resigned' | 'checkmate' | 'stalemate',
  side: Side,
) {
  const entry = newSystemEntry(event, side);
  addChatEntry(room, entry);
  broadcastChatToPlayers(room, entry);
}

function setConnected(room: RoomState, guestId: string, connected: boolean) {
  if (room.red?.guestId === guestId) room.red.connected = connected;
  if (room.black?.guestId === guestId) room.black.connected = connected;
}

async function readDisplayNameFromBody(
  c: Context,
): Promise<{ displayName: string | null } | Response> {
  const raw = await c.req.text();
  let body: unknown = {};
  if (raw.trim() !== '') {
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const parsed = parseDisplayNameField((body as { displayName?: unknown }).displayName);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  return { displayName: parsed.displayName };
}

export interface CreateAppDeps {
  newsStore?: NewsStore | null;
  newsImageStorage?: NewsImageStorage | null;
  userStore?: UserStore;
  sessionStore?: SessionStore;
  emailTokenStore?: EmailTokenStore;
  emailSender?: EmailSender;
  paymentStore?: PaymentStore;
  savedGameStore?: SavedGameStore;
  stripe?: Stripe | null;
}

/** Build the Hono app with CORS, guest auth, room REST endpoints, and API sub-routers. */
export function createApp(deps?: CreateAppDeps) {
  const app = new Hono();

  let newsStore: NewsStore | null;
  if (deps && 'newsStore' in deps) {
    newsStore = deps.newsStore ?? null;
  } else if (process.env.MONGODB_URI) {
    newsStore = new MongoNewsStore();
  } else {
    newsStore = null;
  }

  let newsImageStorage: NewsImageStorage | null;
  if (deps && 'newsImageStorage' in deps) {
    newsImageStorage = deps.newsImageStorage ?? null;
  } else {
    newsImageStorage = new DiskNewsImageStorage(defaultNewsImageDir());
  }

  let userStore: UserStore;
  if (deps?.userStore) {
    userStore = deps.userStore;
  } else if (process.env.MONGODB_URI) {
    userStore = new MongoUserStore();
  } else {
    userStore = new MemoryUserStore();
  }

  let sessionStore: SessionStore;
  if (deps?.sessionStore) {
    sessionStore = deps.sessionStore;
  } else if (process.env.MONGODB_URI) {
    sessionStore = new MongoSessionStore();
  } else {
    sessionStore = new MemorySessionStore();
  }

  let emailTokenStore: EmailTokenStore;
  if (deps?.emailTokenStore) {
    emailTokenStore = deps.emailTokenStore;
  } else if (process.env.MONGODB_URI) {
    emailTokenStore = new MongoEmailTokenStore();
  } else {
    emailTokenStore = new MemoryEmailTokenStore();
  }

  const emailSender = deps?.emailSender ?? createEmailSender();

  let paymentStore: PaymentStore;
  if (deps?.paymentStore) {
    paymentStore = deps.paymentStore;
  } else if (process.env.MONGODB_URI) {
    paymentStore = new MongoPaymentStore();
  } else {
    paymentStore = new MemoryPaymentStore();
  }

  let savedGameStore: SavedGameStore;
  if (deps?.savedGameStore) {
    savedGameStore = deps.savedGameStore;
  } else if (process.env.MONGODB_URI) {
    savedGameStore = new MongoSavedGameStore();
  } else {
    savedGameStore = new MemorySavedGameStore();
  }

  app.use(
    '*',
    cors({
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      allowHeaders: ['Content-Type', 'x-guest-id', 'Authorization'],
      credentials: true,
    }),
  );

  app.use('*', createAuthMiddleware({ userStore, sessionStore }));

  app.post('/api/rooms', async (c) => {
    const nameResult = await readDisplayNameFromBody(c);
    if (nameResult instanceof Response) return nameResult;
    const guestId = getGuestId(c);
    const room = createRoom(guestId, nameResult.displayName);
    return c.json({ code: room.code, room: publicRoomView(room) });
  });

  app.post('/api/rooms/:code/join', async (c) => {
    const nameResult = await readDisplayNameFromBody(c);
    if (nameResult instanceof Response) return nameResult;
    const guestId = getGuestId(c);
    const code = c.req.param('code').toUpperCase();
    const before = getRoom(code);
    const hadBlack = !!before?.black;
    const result = joinRoom(code, guestId, nameResult.displayName);
    if ('error' in result) return c.json({ error: result.error }, 400);
    if (result.side === 'b' && !hadBlack) {
      appendAndBroadcastSystem(result.room, 'joined', 'b');
    }
    broadcastRoom(result.room);
    return c.json({ side: result.side, room: publicRoomView(result.room) });
  });

  // `side` tells a returning player (same guest id) which seat they already hold,
  // so the client can skip the join form after a refresh; null for non-players.
  app.get('/api/rooms/:code', (c) => {
    const room = getRoom(c.req.param('code'));
    if (!room) return c.json({ error: 'Room not found' }, 404);
    return c.json({ room: publicRoomView(room), side: seatFor(room, getGuestId(c)) });
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.route('/api/ai', createAiRoutes({ userStore }));
  app.route('/api/coach', createCoachRoutes({ userStore }));
  app.route('/api/engine', engineRoutes);
  app.route('/api/opponent', opponentRoutes);
  app.route('/api/news', createNewsRoutes(newsStore, newsImageStorage));
  app.route(
    '/api/auth',
    createPlayerAuthRoutes({ userStore, sessionStore, emailTokenStore, emailSender }),
  );
  app.route('/api', createMeRoute());
  app.route('/api/admin', createAdminRoutes({ userStore, paymentStore }));
  app.route('/api/admin/news', createAdminNewsRoutes(newsStore, newsImageStorage));
  app.route(
    '/api/billing',
    createBillingRoutes({
      userStore,
      paymentStore,
      ...(deps && 'stripe' in deps ? { stripe: deps.stripe } : {}),
    }),
  );
  app.route('/api/games', createGamesRoutes({ savedGameStore }));

  return app;
}

/**
 * Attach the `/ws` room socket to an HTTP server.
 * Clients `subscribe` to a room code, then send `move`s or `resign`; the server re-validates
 * each move with the engine, applies resignations on any turn, and broadcasts the new room
 * state to every subscriber.
 */
export function attachRoomSockets(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as
          | { type: 'subscribe'; code: string; guestId: string }
          | {
              type: 'move';
              code?: string;
              guestId: string;
              from: [number, number];
              to: [number, number];
            }
          | { type: 'resign'; code?: string; guestId: string }
          | { type: 'chat'; text: string };

        if (msg.type === 'subscribe') {
          const code = msg.code.toUpperCase();
          const room = getRoom(code);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
            return;
          }
          sockets.set(ws, { guestId: msg.guestId, code });
          setConnected(room, msg.guestId, true);
          ws.send(JSON.stringify({ type: 'room', room: publicRoomView(room) }));
          const playerSide = seatFor(room, msg.guestId);
          if (playerSide) {
            ws.send(
              JSON.stringify({
                type: 'chat_history',
                messages: room.chat ?? [],
              }),
            );
          }
          broadcastRoom(room);
          return;
        }

        if (msg.type === 'chat') {
          const meta = sockets.get(ws);
          const code = meta?.code?.toUpperCase();
          const room = code ? getRoom(code) : undefined;
          const guestId = meta?.guestId ?? '';
          const text = typeof msg.text === 'string' ? msg.text : '';
          const result = postPlayerChat(room, guestId, text, chatRateLimiter);
          if (!result.ok) {
            ws.send(
              JSON.stringify({
                type: 'chat_rejected',
                error: result.error,
                text: result.text,
              }),
            );
            return;
          }
          if (room) broadcastChatToPlayers(room, result.entry);
          return;
        }

        if (msg.type === 'move') {
          const meta = sockets.get(ws);
          const code = (msg.code ?? meta?.code)?.toUpperCase();
          if (!code) {
            ws.send(JSON.stringify({ type: 'move_rejected', error: 'Not in a room' }));
            return;
          }
          const room = getRoom(code);
          if (!room) {
            ws.send(JSON.stringify({ type: 'move_rejected', error: 'Room not found' }));
            return;
          }
          const move: Move = { from: msg.from, to: msg.to };
          const result = applyRoomMove(room, msg.guestId, move);
          if (!result.ok) {
            ws.send(JSON.stringify({ type: 'move_rejected', error: result.error }));
            return;
          }
          broadcastRoom(result.room);
          if (result.room.status === 'checkmate' || result.room.status === 'stalemate') {
            const winner = result.room.winner;
            if (winner) {
              appendAndBroadcastSystem(result.room, result.room.status, winner);
            }
          }
          if (result.room.status) {
            await saveFinishedGame({
              code: result.room.code,
              redGuestId: result.room.red?.guestId,
              blackGuestId: result.room.black?.guestId,
              history: result.room.history,
              status: result.room.status,
              endedAt: new Date(),
            });
          }
          return;
        }

        // --- Resign: seated player concedes; room resolution mirrors the move guards above ---
        if (msg.type === 'resign') {
          const meta = sockets.get(ws);
          const code = (msg.code ?? meta?.code)?.toUpperCase();
          if (!code) {
            ws.send(JSON.stringify({ type: 'error', error: 'Not in a room' }));
            return;
          }
          const room = getRoom(code);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', error: 'Room not found' }));
            return;
          }
          const playerSide = seatFor(room, msg.guestId);
          const result = resignRoom(room, msg.guestId);
          if (!result.ok) {
            // Per the resign contract, failures reply with an `error` field to the requester only.
            ws.send(JSON.stringify({ type: 'error', error: result.error }));
            return;
          }
          if (playerSide) appendAndBroadcastSystem(room, 'resigned', playerSide);
          broadcastRoom(room);
          // Status is always 'resigned' here; the guard mirrors the move path for TypeScript.
          if (room.status) {
            await saveFinishedGame({
              code: room.code,
              redGuestId: room.red?.guestId,
              blackGuestId: room.black?.guestId,
              history: room.history,
              status: room.status,
              endedAt: new Date(),
            });
          }
          return;
        }
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      }
    });

    ws.on('close', () => {
      const meta = sockets.get(ws);
      if (meta?.code) {
        const room = getRoom(meta.code);
        if (room) {
          setConnected(room, meta.guestId, false);
          broadcastRoom(room);
        }
      }
      sockets.delete(ws);
    });
  });

  return wss;
}
