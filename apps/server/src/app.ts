/**
 * Hono app (REST routes) and the room WebSocket server.
 * Kept free of `listen()` and env loading so tests can import it directly.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Server } from 'http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import type { Move } from '@jade-court/xiangqi-engine';
import { saveFinishedGame } from './db.js';
import { authMiddleware, getGuestId } from './middleware/auth.js';
import {
  applyRoomMove,
  createRoom,
  getRoom,
  joinRoom,
  publicRoomView,
  type RoomState,
} from './rooms.js';
import aiRoutes from './routes/ai.js';
import coachRoutes from './routes/coach.js';
import engineRoutes from './routes/engine.js';
import opponentRoutes from './routes/opponent.js';

/** Open room sockets, shared by REST joins and WebSocket messages for broadcasts. */
const sockets = new Map<WebSocket, { guestId: string; code?: string }>();

function broadcastRoom(room: RoomState) {
  const payload = JSON.stringify({ type: 'room', room: publicRoomView(room) });
  for (const [ws, meta] of sockets) {
    if (meta.code === room.code && ws.readyState === ws.OPEN) ws.send(payload);
  }
}

function setConnected(room: RoomState, guestId: string, connected: boolean) {
  if (room.red?.guestId === guestId) room.red.connected = connected;
  if (room.black?.guestId === guestId) room.black.connected = connected;
}

/** Build the Hono app with CORS, guest auth, room REST endpoints, and API sub-routers. */
export function createApp() {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      allowHeaders: ['Content-Type', 'x-guest-id'],
    }),
  );

  app.use('*', authMiddleware);

  app.post('/api/rooms', (c) => {
    const guestId = getGuestId(c);
    const room = createRoom(guestId);
    return c.json({ code: room.code, room: publicRoomView(room) });
  });

  app.post('/api/rooms/:code/join', (c) => {
    const guestId = getGuestId(c);
    const code = c.req.param('code').toUpperCase();
    const result = joinRoom(code, guestId);
    if ('error' in result) return c.json({ error: result.error }, 400);
    broadcastRoom(result.room);
    return c.json({ side: result.side, room: publicRoomView(result.room) });
  });

  app.get('/api/rooms/:code', (c) => {
    const room = getRoom(c.req.param('code'));
    if (!room) return c.json({ error: 'Room not found' }, 404);
    return c.json({ room: publicRoomView(room) });
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.route('/api/ai', aiRoutes);
  app.route('/api/coach', coachRoutes);
  app.route('/api/engine', engineRoutes);
  app.route('/api/opponent', opponentRoutes);

  return app;
}

/**
 * Attach the `/ws` room socket to an HTTP server.
 * Clients `subscribe` to a room code, then send `move`s; the server re-validates each move
 * with the engine and broadcasts the new room state to every subscriber.
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
            };

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
          broadcastRoom(room);
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
