import { getRequestListener } from '@hono/node-server';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import WebSocket, { type WebSocketServer } from 'ws';
import { attachRoomSockets, createApp } from './app.js';
import { createRoom, getRoom, joinRoom } from './rooms.js';

type Msg = { type: string; [k: string]: unknown };
type RoomMsg = Msg & {
  room: {
    history: unknown[];
    turn: string;
    redConnected: boolean;
    blackConnected: boolean;
  };
};

let server: Server;
let wss: WebSocketServer;
let url: string;
const open: WebSocket[] = [];

beforeAll(async () => {
  server = createServer(getRequestListener(createApp().fetch));
  wss = attachRoomSockets(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});

afterEach(() => {
  for (const ws of open.splice(0)) ws.terminate();
});

afterAll(async () => {
  wss.close();
  await new Promise((resolve) => server.close(resolve));
});

/** WebSocket client that buffers messages so tests can await the next matching one. */
async function connect() {
  const ws = new WebSocket(url);
  open.push(ws);
  const inbox: Msg[] = [];
  const waiters: { match: (m: Msg) => boolean; resolve: (m: Msg) => void }[] = [];

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString()) as Msg;
    const i = waiters.findIndex((w) => w.match(msg));
    if (i >= 0) waiters.splice(i, 1)[0]!.resolve(msg);
    else inbox.push(msg);
  });
  await new Promise((resolve) => ws.once('open', resolve));

  return {
    ws,
    send: (data: unknown) => ws.send(typeof data === 'string' ? data : JSON.stringify(data)),
    next<T extends Msg = Msg>(match: (m: Msg) => boolean = () => true): Promise<T> {
      const i = inbox.findIndex(match);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0] as T);
      return new Promise((resolve) =>
        waiters.push({ match, resolve: resolve as (m: Msg) => void }),
      );
    },
  };
}

const isRoom =
  (pred: (r: RoomMsg['room']) => boolean = () => true) =>
  (m: Msg) =>
    m.type === 'room' && pred((m as RoomMsg).room);

let seq = 0;
function seatedRoom() {
  const red = `ws-red-${++seq}`;
  const black = `ws-black-${seq}`;
  const room = createRoom(red);
  joinRoom(room.code, black);
  return { code: room.code, red, black };
}

async function subscribedPair() {
  const { code, red, black } = seatedRoom();
  const redWs = await connect();
  redWs.send({ type: 'subscribe', code, guestId: red });
  await redWs.next(isRoom((r) => r.redConnected));
  const blackWs = await connect();
  blackWs.send({ type: 'subscribe', code: code.toLowerCase(), guestId: black });
  await blackWs.next(isRoom((r) => r.blackConnected));
  await redWs.next(isRoom((r) => r.blackConnected));
  return { code, red, black, redWs, blackWs };
}

describe('room WebSocket', () => {
  it('sends a snapshot on subscribe and marks the player connected', async () => {
    const { code, red } = seatedRoom();
    const client = await connect();
    client.send({ type: 'subscribe', code, guestId: red });
    const msg = await client.next<RoomMsg>(isRoom());
    expect(msg.room.redConnected).toBe(true);
    expect(getRoom(code)?.red?.connected).toBe(true);
  });

  it('broadcasts a legal move to both players', async () => {
    const { red, redWs, blackWs } = await subscribedPair();
    redWs.send({ type: 'move', guestId: red, from: [9, 1], to: [7, 2] });
    const [a, b] = await Promise.all([
      redWs.next<RoomMsg>(isRoom((r) => r.history.length === 1)),
      blackWs.next<RoomMsg>(isRoom((r) => r.history.length === 1)),
    ]);
    expect(a.room.turn).toBe('b');
    expect(b.room.turn).toBe('b');
  });

  it('rejects a move out of turn', async () => {
    const { black, blackWs } = await subscribedPair();
    blackWs.send({ type: 'move', guestId: black, from: [0, 1], to: [2, 2] });
    expect(await blackWs.next((m) => m.type === 'move_rejected')).toMatchObject({
      error: 'Not your turn',
    });
  });

  it('rejects a move from an unseated guest id', async () => {
    const { blackWs } = await subscribedPair();
    blackWs.send({ type: 'move', guestId: 'intruder', from: [9, 1], to: [7, 2] });
    expect(await blackWs.next((m) => m.type === 'move_rejected')).toMatchObject({
      error: 'Not your turn',
    });
  });

  it('rejects an illegal move', async () => {
    const { red, redWs } = await subscribedPair();
    redWs.send({ type: 'move', guestId: red, from: [9, 0], to: [5, 0] });
    expect(await redWs.next((m) => m.type === 'move_rejected')).toMatchObject({
      error: 'Illegal move',
    });
  });

  it('rejects moves from a socket that never subscribed', async () => {
    const client = await connect();
    client.send({ type: 'move', guestId: 'nobody', from: [9, 1], to: [7, 2] });
    expect(await client.next()).toEqual({ type: 'move_rejected', error: 'Not in a room' });
  });

  it('reports unknown rooms and malformed messages', async () => {
    const client = await connect();
    client.send({ type: 'subscribe', code: 'JADE-ZZZZ', guestId: 'x' });
    expect(await client.next()).toEqual({ type: 'error', message: 'Room not found' });
    client.send('not json');
    expect(await client.next()).toEqual({ type: 'error', message: 'Invalid message' });
  });

  it('marks a player disconnected when their socket closes', async () => {
    const { code, redWs, blackWs } = await subscribedPair();
    blackWs.ws.close();
    await redWs.next(isRoom((r) => !r.blackConnected));
    expect(getRoom(code)?.black?.connected).toBe(false);
  });
});
