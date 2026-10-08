import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { X } from '@jade-court/xiangqi-engine';
import type { Move } from '@jade-court/xiangqi-engine';
import { createApp } from './app.js';

const app = createApp();

const ENV_KEYS = ['PLAY_OPPONENT_PROVIDER', 'PIKAFISH_PATH', 'LLM_PROVIDER', 'GEMINI_API_KEY'];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  delete process.env.PIKAFISH_PATH;
  process.env.LLM_PROVIDER = 'gemini';
  delete process.env.GEMINI_API_KEY;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
});

function post(path: string, body?: unknown, guestId = 'guest-a') {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-guest-id': guestId },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  });
}

const isLegalOpening = (m: Move) =>
  X.legalMoves(X.initialBoard(), 'r').some(
    (l) =>
      l.from[0] === m.from[0] &&
      l.from[1] === m.from[1] &&
      l.to[0] === m.to[0] &&
      l.to[1] === m.to[1],
  );

describe('health and CORS', () => {
  it('GET /health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('allows the Vite dev origin', async () => {
    const res = await app.request('/health', { headers: { Origin: 'http://localhost:5173' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });
});

describe('room REST endpoints', () => {
  it('creates, joins, and reads a room', async () => {
    const created = await post('/api/rooms', {}, 'host-1');
    expect(created.status).toBe(200);
    const { code, room } = (await created.json()) as { code: string; room: { redJoined: boolean } };
    expect(code).toMatch(/^JADE-/);
    expect(room.redJoined).toBe(true);

    const joined = await post(`/api/rooms/${code.toLowerCase()}/join`, {}, 'guest-1');
    expect(joined.status).toBe(200);
    expect(await joined.json()).toMatchObject({ side: 'b', room: { blackJoined: true } });

    const read = await app.request(`/api/rooms/${code}`);
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ room: { code, redJoined: true, blackJoined: true } });
  });

  it('rejects a third player', async () => {
    const { code } = (await (await post('/api/rooms', {}, 'host-2')).json()) as { code: string };
    await post(`/api/rooms/${code}/join`, {}, 'guest-2');
    const res = await post(`/api/rooms/${code}/join`, {}, 'guest-3');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Room is full' });
  });

  it('returns 400 when joining and 404 when reading an unknown room', async () => {
    const join = await post('/api/rooms/JADE-ZZZZ/join');
    expect(join.status).toBe(400);
    expect(await join.json()).toEqual({ error: 'Room not found' });

    const read = await app.request('/api/rooms/JADE-ZZZZ');
    expect(read.status).toBe(404);
  });
});

describe('POST /api/opponent/move', () => {
  const body = { board: X.initialBoard(), side: 'r', difficulty: 'beginner' };

  it('rejects malformed JSON', async () => {
    const res = await post('/api/opponent/move', '{not json');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_json' });
  });

  it('rejects an invalid request body', async () => {
    const res = await post('/api/opponent/move', { ...body, difficulty: 'grandmaster' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_request' });
  });

  it('returns a legal negamax move with PLAY_OPPONENT_PROVIDER=local', async () => {
    process.env.PLAY_OPPONENT_PROVIDER = 'local';
    const res = await post('/api/opponent/move', body);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { move: Move; source: string };
    expect(data.source).toBe('negamax');
    expect(isLegalOpening(data.move)).toBe(true);
  });

  it('falls back to negamax when Pikafish is not configured', async () => {
    process.env.PLAY_OPPONENT_PROVIDER = 'engine';
    const res = await post('/api/opponent/move', body);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { move: Move; source: string };
    expect(data.source).toBe('negamax');
    expect(isLegalOpening(data.move)).toBe(true);
  });

  it('returns 503 in llm mode without an API key', async () => {
    process.env.PLAY_OPPONENT_PROVIDER = 'llm';
    const res = await post('/api/opponent/move', body, 'guest-llm');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'llm_unconfigured' });
  });

  it('returns 400 when the side to move has no legal moves', async () => {
    process.env.PLAY_OPPONENT_PROVIDER = 'local';
    const board = Array.from({ length: 10 }, () => Array(9).fill(null));
    board[9][3] = { t: 'G', s: 'r' };
    board[0][4] = { t: 'G', s: 'b' };
    board[0][0] = { t: 'R', s: 'r' };
    board[1][8] = { t: 'R', s: 'r' };
    const res = await post('/api/opponent/move', { board, side: 'b', difficulty: 'beginner' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no_legal_moves' });
  });
});

describe('POST /api/engine/move', () => {
  it('returns 503 when Pikafish is not configured', async () => {
    const res = await post('/api/engine/move', {
      board: X.initialBoard(),
      side: 'r',
      difficulty: 'beginner',
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'pikafish_unconfigured' });
  });
});
