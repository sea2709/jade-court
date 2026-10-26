import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { SESSION_COOKIE_NAME } from '../auth/config.js';
import { hashSessionToken } from '../auth/sessionToken.js';
import {
  resetPlayerAuthRateLimitsForTests,
  setSavedGameAutosaveMaxPerUserForTests,
} from '../auth/rateLimit.js';
import * as dbModule from '../db.js';
import {
  MAX_CHAT_MESSAGES,
  MAX_CHAT_TEXT_CHARS,
  MAX_MOVES_REQUEST_LENGTH,
  MAX_SAVE_PLIES,
} from '../games/caps.js';
import { MemorySavedGameStore } from '../games/memoryStore.js';
import { MemorySessionStore } from '../users/memorySessionStore.js';
import { MemoryUserStore } from '../users/memoryStore.js';
import { hashPassword } from '../users/password.js';

const SECRET = 'test-session-secret-0123456789abcdef0123456789ab';

const checkmateFixture = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../web/src/test/fixtures/home-demo-checkmate.json',
    ),
    'utf8',
  ),
) as { from: [number, number]; to: [number, number] }[];

function setupAuthEnv() {
  process.env.SESSION_SECRET = SECRET;
  process.env.NODE_ENV = 'test';
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function createSessionForUser(
  sessionStore: MemorySessionStore,
  userId: string,
): Promise<string> {
  const token = `session-${userId}`;
  await sessionStore.create({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + 3600_000),
  });
  return token;
}

function sessionHeaders(token: string): Record<string, string> {
  return { ...JSON_HEADERS, Cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

async function registerUser(
  userStore: MemoryUserStore,
  sessionStore: MemorySessionStore,
  email: string,
): Promise<{ userId: string; token: string }> {
  const user = await userStore.create({
    email,
    passwordHash: await hashPassword('password-123'),
    displayName: 'Tester',
  });
  const token = await createSessionForUser(sessionStore, user.id);
  return { userId: user.id, token };
}

describe('active games API', () => {
  let userStore: MemoryUserStore;
  let sessionStore: MemorySessionStore;
  let savedGameStore: MemorySavedGameStore;
  let app: ReturnType<typeof createApp>;
  let token: string;
  let userId: string;
  let otherToken: string;

  beforeEach(async () => {
    resetPlayerAuthRateLimitsForTests();
    setupAuthEnv();
    userStore = new MemoryUserStore();
    sessionStore = new MemorySessionStore();
    savedGameStore = new MemorySavedGameStore();
    app = createApp({
      newsStore: null,
      userStore,
      sessionStore,
      savedGameStore,
    });
    const a = await registerUser(userStore, sessionStore, 'a@example.com');
    userId = a.userId;
    token = a.token;
    const b = await registerUser(userStore, sessionStore, 'b@example.com');
    otherToken = b.token;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 for guests on all routes', async () => {
    const paths = [
      ['GET', '/api/games/active'],
      ['GET', '/api/games/active/pvc'],
      ['PUT', '/api/games/active/pvc'],
      ['DELETE', '/api/games/active/pvc'],
    ] as const;
    for (const [method, path] of paths) {
      const res = await app.request(path, {
        method,
        headers: JSON_HEADERS,
        ...(method === 'PUT'
          ? { body: JSON.stringify({ config: { level: 'beginner', side: 'r' }, moves: [] }) }
          : {}),
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('rejects invalid mode', async () => {
    const res = await app.request('/api/games/active/online', { headers: sessionHeaders(token) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_mode' });
  });

  it('saves and loads a pvc game', async () => {
    const body = {
      config: { level: 'beginner', side: 'r' },
      moves: [{ from: [7, 1], to: [7, 4] }],
    };
    const put = await app.request('/api/games/active/pvc', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify(body),
    });
    expect(put.status).toBe(200);
    const saved = await put.json();
    expect(saved).toMatchObject({
      mode: 'pvc',
      config: body.config,
      moves: body.moves,
      revision: 1,
    });
    expect(saved.createdAt).toBeTypeOf('string');
    expect(saved.updatedAt).toBeTypeOf('string');

    const list = await app.request('/api/games/active', { headers: sessionHeaders(token) });
    expect(list.status).toBe(200);
    const { games } = await list.json();
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      mode: 'pvc',
      moveCount: 1,
      side: 'r',
      level: 'beginner',
    });

    const get = await app.request('/api/games/active/pvc', { headers: sessionHeaders(token) });
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({
      mode: 'pvc',
      revision: 1,
      moves: body.moves,
    });
  });

  it('returns 400 invalid_moves for illegal sequences', async () => {
    const res = await app.request('/api/games/active/pvc', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { level: 'beginner', side: 'r' },
        moves: [{ from: [7, 1], to: [0, 0] }],
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_moves' });
  });

  it('returns 409 stale_revision when baseRevision is behind', async () => {
    const put1 = await app.request('/api/games/active/pvc', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { level: 'beginner', side: 'r' },
        moves: [{ from: [7, 1], to: [7, 4] }],
      }),
    });
    expect(put1.status).toBe(200);
    const first = await put1.json();

    const put2 = await app.request('/api/games/active/pvc', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { level: 'beginner', side: 'r' },
        moves: [
          { from: [7, 1], to: [7, 4] },
          { from: [0, 1], to: [2, 2] },
        ],
        baseRevision: first.revision,
      }),
    });
    expect(put2.status).toBe(200);
    const second = await put2.json();
    expect(second.revision).toBe(2);

    const stale = await app.request('/api/games/active/pvc', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { level: 'beginner', side: 'r' },
        moves: [{ from: [7, 1], to: [7, 4] }],
        baseRevision: first.revision,
      }),
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: 'stale_revision' });
  });

  it('isolates saves per user', async () => {
    await app.request('/api/games/active/pvc', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { level: 'intermediate', side: 'b' },
        moves: [{ from: [7, 1], to: [7, 4] }],
      }),
    });

    const otherGet = await app.request('/api/games/active/pvc', {
      headers: sessionHeaders(otherToken),
    });
    expect(otherGet.status).toBe(404);

    const otherList = await app.request('/api/games/active', {
      headers: sessionHeaders(otherToken),
    });
    expect((await otherList.json()).games).toEqual([]);
  });

  it('deletes save on abandon', async () => {
    await app.request('/api/games/active/ai', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { modelId: 'gemini', difficulty: 'beginner', side: 'r' },
        moves: [],
      }),
    });
    const del = await app.request('/api/games/active/ai', {
      method: 'DELETE',
      headers: sessionHeaders(token),
    });
    expect(del.status).toBe(204);
    const get = await app.request('/api/games/active/ai', { headers: sessionHeaders(token) });
    expect(get.status).toBe(404);
  });

  it('returns 400 too_many_moves when plies exceed MAX_SAVE_PLIES', async () => {
    const longMoves = Array.from({ length: MAX_SAVE_PLIES + 1 }, () => ({
      from: [7, 1],
      to: [7, 4],
    }));
    const res = await app.request('/api/games/active/pvc', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { level: 'beginner', side: 'r' },
        moves: longMoves,
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'too_many_moves' });
  });

  it('returns 400 too_many_moves before validating huge move arrays', async () => {
    const moves = Array.from({ length: MAX_MOVES_REQUEST_LENGTH + 1 }, () => ({
      from: [7, 1],
      to: [7, 4],
    }));
    const res = await app.request('/api/games/active/pvc', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { level: 'beginner', side: 'r' },
        moves,
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'too_many_moves' });
  });

  it('preserves ai chat on update when chat is omitted', async () => {
    const chat = [{ id: 1, from: 'system', text: 'hello coach' }];
    const first = await app.request('/api/games/active/ai', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { modelId: 'm1', difficulty: 'beginner', side: 'r' },
        moves: [],
        chat,
      }),
    });
    expect(first.status).toBe(200);
    const saved = await first.json();

    const second = await app.request('/api/games/active/ai', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { modelId: 'm1', difficulty: 'beginner', side: 'r' },
        moves: [{ from: [7, 1], to: [7, 4] }],
        baseRevision: saved.revision,
      }),
    });
    expect(second.status).toBe(200);
    const updated = await second.json();
    expect(updated.chat).toEqual(chat);
  });

  it('caps chat messages and text on save', async () => {
    const chat = Array.from({ length: MAX_CHAT_MESSAGES + 2 }, (_, i) => ({
      id: i,
      from: 'player',
      text: 'y'.repeat(MAX_CHAT_TEXT_CHARS + 5),
    }));
    const res = await app.request('/api/games/active/ai', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { modelId: 'm1', difficulty: 'advanced', side: 'r' },
        moves: [],
        chat,
      }),
    });
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.chat).toHaveLength(MAX_CHAT_MESSAGES);
    expect(saved.chat[0].id).toBe(2);
    expect(saved.chat[0].text).toHaveLength(MAX_CHAT_TEXT_CHARS);
  });

  it('keeps active save when archive insert fails on game over', async () => {
    await app.request('/api/games/active/pvc', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { level: 'beginner', side: 'r' },
        moves: [{ from: [7, 1], to: [7, 4] }],
      }),
    });

    vi.spyOn(dbModule, 'saveUserFinishedGame').mockRejectedValue(new Error('insert failed'));

    const res = await app.request('/api/games/active/pvc', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { level: 'beginner', side: 'r' },
        moves: checkmateFixture,
      }),
    });
    expect(res.status).toBe(500);

    const get = await app.request('/api/games/active/pvc', { headers: sessionHeaders(token) });
    expect(get.status).toBe(200);
  });

  it('finishes game: deletes active save and writes to games collection', async () => {
    const saveSpy = vi.spyOn(dbModule, 'saveUserFinishedGame').mockResolvedValue();

    const res = await app.request('/api/games/active/pvc', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body: JSON.stringify({
        config: { level: 'beginner', side: 'r' },
        moves: checkmateFixture,
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ finished: true, status: 'checkmate' });
    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        mode: 'pvc',
        status: 'checkmate',
        moves: checkmateFixture,
      }),
    );

    const get = await app.request('/api/games/active/pvc', { headers: sessionHeaders(token) });
    expect(get.status).toBe(404);
  });

  it('returns 429 when autosave rate limit is exceeded', async () => {
    setSavedGameAutosaveMaxPerUserForTests(1);
    const body = JSON.stringify({
      config: { level: 'beginner', side: 'r' },
      moves: [{ from: [7, 1], to: [7, 4] }],
    });
    const first = await app.request('/api/games/active/pvc', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body,
    });
    expect(first.status).toBe(200);
    const second = await app.request('/api/games/active/pvc', {
      method: 'PUT',
      headers: sessionHeaders(token),
      body,
    });
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ error: 'rate_limited' });
  });
});
