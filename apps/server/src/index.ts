import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createServer } from 'http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import type { Move } from '@jade-court/xiangqi-engine';
import { getDb, saveFinishedGame } from './db.js';
import { authMiddleware, getGuestId } from './middleware/auth.js';
import {
  applyRoomMove,
  createRoom,
  getRoom,
  joinRoom,
  publicRoomView,
  type RoomState,
} from './rooms.js';

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

const port = Number(process.env.PORT ?? 3001);

const listener = getRequestListener(app.fetch);
const httpServer = createServer(listener);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
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

wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as
        | { type: 'subscribe'; code: string; guestId: string }
        | { type: 'move'; code?: string; guestId: string; from: [number, number]; to: [number, number] };

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

httpServer.listen(port, () => {
  console.log(`Jade Court server listening on http://localhost:${port}`);
});

getDb()
  .then((db) => {
    if (db) console.log('MongoDB connected');
    else console.log('MongoDB skipped (set MONGODB_URI to enable persistence)');
  })
  .catch((err) => console.warn('MongoDB connection failed:', err));
