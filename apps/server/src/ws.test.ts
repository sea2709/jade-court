import { X } from '@jade-court/xiangqi-engine';
import type { Board, Piece } from '@jade-court/xiangqi-engine';
import { getRequestListener } from '@hono/node-server';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import WebSocket, { type WebSocketServer } from 'ws';
import { attachRoomSockets, createApp } from './app.js';
import type { ChatEntry } from './chat.js';
import { createRoom, getRoom, joinRoom } from './rooms.js';

type Msg = { type: string; [k: string]: unknown };
type RoomMsg = Msg & {
  room: {
    history: unknown[];
    turn: string;
    status: string | null;
    winner: string | null;
    redConnected: boolean;
    blackConnected: boolean;
  };
};

let server: Server;
let wss: WebSocketServer;
let url: string;
let httpBase: string;
const open: WebSocket[] = [];

beforeAll(async () => {
  server = createServer(getRequestListener(createApp().fetch));
  wss = attachRoomSockets(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  url = `ws://127.0.0.1:${port}/ws`;
  httpBase = `http://127.0.0.1:${port}`;
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

type ChatMsg = Msg & { message: ChatEntry };
type ChatHistoryMsg = Msg & { messages: ChatEntry[] };

const isChat =
  (pred: (e: ChatEntry) => boolean = () => true) =>
  (m: Msg) =>
    m.type === 'chat' && pred((m as ChatMsg).message);

const isChatHistory = () => (m: Msg) => m.type === 'chat_history';

function boardWith(...pieces: [number, number, Piece][]): Board {
  const b = Array.from({ length: 10 }, () => Array(9).fill(null)) as Board;
  for (const [r, c, p] of pieces) b[r][c] = p;
  return b;
}

async function httpJoin(code: string, guestId: string) {
  return fetch(`${httpBase}/api/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-guest-id': guestId },
    body: '{}',
  });
}

/** Resolves true when `p` stays pending for `ms` — proves no matching message was sent. */
function silence(p: Promise<unknown>, ms = 150): Promise<boolean> {
  return Promise.race([
    p.then(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(true), ms)),
  ]);
}

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

describe('room WebSocket resign', () => {
  it('broadcasts a resignation to both players with the opponent as winner', async () => {
    const { code, red, redWs, blackWs } = await subscribedPair();
    redWs.send({ type: 'resign', guestId: red });
    const [a, b] = await Promise.all([
      redWs.next<RoomMsg>(isRoom((r) => r.status === 'resigned')),
      blackWs.next<RoomMsg>(isRoom((r) => r.status === 'resigned')),
    ]);
    expect(a.room.winner).toBe('b');
    expect(b.room.winner).toBe('b');
    const room = getRoom(code);
    expect(room?.status).toBe('resigned');
    expect(room?.winner).toBe('b');
  });

  it('rejects a resign from a spectator without broadcasting', async () => {
    const { code, redWs, blackWs } = await subscribedPair();
    const spectator = await connect();
    spectator.send({ type: 'subscribe', code, guestId: 'watcher' });
    await spectator.next(isRoom());
    spectator.send({ type: 'resign', guestId: 'watcher' });
    expect(await spectator.next((m) => m.type === 'error')).toEqual({
      type: 'error',
      error: 'Not a player in this room',
    });
    expect(getRoom(code)?.status).toBeNull();
    expect(await silence(redWs.next(isRoom((r) => r.status === 'resigned')))).toBe(true);
    expect(await silence(blackWs.next(isRoom((r) => r.status === 'resigned')))).toBe(true);
  });

  it('rejects a resign after the game has ended', async () => {
    const { red, black, redWs, blackWs } = await subscribedPair();
    redWs.send({ type: 'resign', guestId: red });
    await Promise.all([
      redWs.next<RoomMsg>(isRoom((r) => r.status === 'resigned')),
      blackWs.next<RoomMsg>(isRoom((r) => r.status === 'resigned')),
    ]);
    blackWs.send({ type: 'resign', guestId: black });
    expect(await blackWs.next((m) => m.type === 'error')).toEqual({
      type: 'error',
      error: 'Game is over',
    });
  });

  it('rejects moves after a resignation', async () => {
    const { red, black, redWs, blackWs } = await subscribedPair();
    redWs.send({ type: 'resign', guestId: red });
    await Promise.all([
      redWs.next<RoomMsg>(isRoom((r) => r.status === 'resigned')),
      blackWs.next<RoomMsg>(isRoom((r) => r.status === 'resigned')),
    ]);
    blackWs.send({ type: 'move', guestId: black, from: [0, 1], to: [2, 2] });
    expect(await blackWs.next((m) => m.type === 'move_rejected')).toMatchObject({
      error: 'Game is over',
    });
  });

  it('returns the resigned result in the snapshot when re-subscribing', async () => {
    const { code, red, redWs, blackWs } = await subscribedPair();
    redWs.send({ type: 'resign', guestId: red });
    await Promise.all([
      redWs.next<RoomMsg>(isRoom((r) => r.status === 'resigned')),
      blackWs.next<RoomMsg>(isRoom((r) => r.status === 'resigned')),
    ]);
    const reconnected = await connect();
    reconnected.send({ type: 'subscribe', code, guestId: red });
    const msg = await reconnected.next<RoomMsg>(isRoom((r) => r.status === 'resigned'));
    expect(msg.room.winner).toBe('b');
  });

  it('rejects resigns from a socket that never subscribed', async () => {
    const client = await connect();
    client.send({ type: 'resign', guestId: 'nobody' });
    expect(await client.next()).toEqual({ type: 'error', error: 'Not in a room' });
  });

  it('reports unknown rooms for resigns with an explicit bad code', async () => {
    const client = await connect();
    client.send({ type: 'resign', guestId: 'x', code: 'JADE-ZZZZ' });
    expect(await client.next()).toEqual({ type: 'error', error: 'Room not found' });
  });
});

describe('room WebSocket chat', () => {
  it('broadcasts chat to both players and chat_rejected to the sender only', async () => {
    const { redWs, blackWs } = await subscribedPair();
    redWs.send({ type: 'chat', text: '  hello  ' });
    const [a, b] = await Promise.all([
      redWs.next<ChatMsg>(isChat((e) => e.kind === 'message' && e.text === 'hello')),
      blackWs.next<ChatMsg>(isChat((e) => e.kind === 'message' && e.text === 'hello')),
    ]);
    expect(a.message.side).toBe('r');
    expect(b.message.side).toBe('r');
    expect(a.message).not.toHaveProperty('guestId');

    redWs.send({ type: 'chat', text: '   ' });
    expect(await redWs.next((m) => m.type === 'chat_rejected')).toEqual({
      type: 'chat_rejected',
      error: 'empty',
      text: '',
    });
    expect(await silence(blackWs.next(isChat()))).toBe(true);
  });

  it('rejects chat from a socket that never subscribed or from a spectator', async () => {
    const { code, redWs } = await subscribedPair();
    const nosub = await connect();
    nosub.send({ type: 'chat', text: 'nope' });
    expect(await nosub.next((m) => m.type === 'chat_rejected')).toMatchObject({
      error: 'not_a_player',
    });

    const spectator = await connect();
    spectator.send({ type: 'subscribe', code, guestId: 'watcher' });
    await spectator.next(isRoom());
    spectator.send({ type: 'chat', text: 'spectate' });
    expect(await spectator.next((m) => m.type === 'chat_rejected')).toMatchObject({
      error: 'not_a_player',
    });
    expect(await silence(redWs.next(isChat()))).toBe(true);
  });

  it('does not send chat broadcasts or history to spectators', async () => {
    const { code, redWs } = await subscribedPair();
    const spectator = await connect();
    spectator.send({ type: 'subscribe', code, guestId: 'watcher' });
    await spectator.next(isRoom());
    expect(await silence(spectator.next(isChatHistory()))).toBe(true);

    redWs.send({ type: 'chat', text: 'players only' });
    await redWs.next(isChat());
    expect(await silence(spectator.next(isChat()))).toBe(true);
    spectator.send({ type: 'chat', text: 'blocked' });
    expect(await spectator.next((m) => m.type === 'chat_rejected')).toBeTruthy();
    expect(
      getRoom(code)?.chat?.some((e) => e.kind === 'message' && e.text === 'players only'),
    ).toBe(true);
    expect(getRoom(code)?.chat?.some((e) => e.text === 'blocked')).toBe(false);
  });

  it('sends chat_history after a player subscribes', async () => {
    const red = `hist-red-${++seq}`;
    const black = `hist-black-${seq}`;
    const room = createRoom(red);
    joinRoom(room.code, black);
    const redWs = await connect();
    redWs.send({ type: 'subscribe', code: room.code, guestId: red });
    await redWs.next(isRoom());
    redWs.send({ type: 'chat', text: 'before reconnect' });
    await redWs.next(isChat((e) => e.text === 'before reconnect'));

    const reconnected = await connect();
    reconnected.send({ type: 'subscribe', code: room.code, guestId: red });
    await reconnected.next(isRoom());
    const hist = await reconnected.next<ChatHistoryMsg>(isChatHistory());
    expect(hist.messages.some((e) => e.kind === 'message' && e.text === 'before reconnect')).toBe(
      true,
    );
  });

  it('emits a joined system line when Black first joins via REST', async () => {
    const red = `join-red-${++seq}`;
    const black = `join-black-${seq}`;
    const room = createRoom(red);
    const redWs = await connect();
    redWs.send({ type: 'subscribe', code: room.code, guestId: red });
    await redWs.next(isRoom());

    const joinRes = await httpJoin(room.code, black);
    expect(joinRes.ok).toBe(true);

    const joined = await redWs.next<ChatMsg>(
      isChat((e) => e.kind === 'system' && e.event === 'joined'),
    );
    expect(joined.message.side).toBe('b');

    const blackWs = await connect();
    blackWs.send({ type: 'subscribe', code: room.code, guestId: black });
    await blackWs.next(isRoom((r) => r.blackJoined));
    const hist = await blackWs.next<ChatHistoryMsg>(isChatHistory());
    expect(hist.messages.some((e) => e.kind === 'system' && e.event === 'joined')).toBe(true);
  });

  it('emits a resigned system line when a player resigns', async () => {
    const { red, redWs, blackWs } = await subscribedPair();
    redWs.send({ type: 'resign', guestId: red });
    const [chatA, chatB, ,] = await Promise.all([
      redWs.next<ChatMsg>(isChat((e) => e.kind === 'system' && e.event === 'resigned')),
      blackWs.next<ChatMsg>(isChat((e) => e.kind === 'system' && e.event === 'resigned')),
      redWs.next<RoomMsg>(isRoom((r) => r.status === 'resigned')),
      blackWs.next<RoomMsg>(isRoom((r) => r.status === 'resigned')),
    ]);
    expect(chatA.message.side).toBe('r');
    expect(chatB.message.side).toBe('r');
  });

  it('emits a checkmate system line for the winning side', async () => {
    const { code, red, redWs, blackWs } = await subscribedPair();
    const room = getRoom(code)!;
    room.board = boardWith(
      [9, 3, { t: 'G', s: 'r' }],
      [0, 4, { t: 'G', s: 'b' }],
      [5, 0, { t: 'R', s: 'r' }],
      [1, 8, { t: 'R', s: 'r' }],
    );
    redWs.send({ type: 'move', guestId: red, from: [5, 0], to: [0, 0] });
    const [chatA, chatB] = await Promise.all([
      redWs.next<ChatMsg>(isChat((e) => e.kind === 'system' && e.event === 'checkmate')),
      blackWs.next<ChatMsg>(isChat((e) => e.kind === 'system' && e.event === 'checkmate')),
    ]);
    expect(chatA.message.side).toBe('r');
    expect(chatB.message.side).toBe('r');
    expect(X.gameStatus(room.board, room.turn)).toBe('checkmate');
  });

  it('does not let a client create a system chat entry', async () => {
    const { redWs } = await subscribedPair();
    redWs.send({
      type: 'chat',
      text: '{"kind":"system","event":"joined","side":"b"}',
    });
    const msg = await redWs.next<ChatMsg>(isChat());
    expect(msg.message.kind).toBe('message');
    expect(msg.message).toMatchObject({ side: 'r' });
    if (msg.message.kind === 'message') {
      expect(msg.message.text).toContain('kind');
    }
  });
});
