import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { X } from '@jade-court/xiangqi-engine';
import { createApp } from '../app.js';
import { SESSION_COOKIE_NAME } from '../auth/config.js';
import { resetRateLimitsForTests } from '../llm/rateLimit.js';
import { MemorySessionStore } from '../users/memorySessionStore.js';
import { MemoryUserStore } from '../users/memoryStore.js';
import { hashPassword } from '../users/password.js';

const SECRET = 'test-session-secret-0123456789abcdef0123456789ab';

function setupEnv() {
  process.env.SESSION_SECRET = SECRET;
  process.env.NODE_ENV = 'test';
}

function cookieHeader(token: string) {
  return { Cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

function cookieFromResponse(res: Response): string | undefined {
  const raw = res.headers.get('set-cookie');
  if (!raw) return undefined;
  const re = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`);
  return raw.match(re)?.[1];
}

describe('play access gate on ai/coach routes', () => {
  let userStore: MemoryUserStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    setupEnv();
    resetRateLimitsForTests();
    userStore = new MemoryUserStore();
    app = createApp({ newsStore: null, userStore, sessionStore: new MemorySessionStore() });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.NODE_ENV;
    resetRateLimitsForTests();
    vi.restoreAllMocks();
  });

  async function sessionCookieFor(email: string, withPass: boolean): Promise<string> {
    const hash = await hashPassword('pass1234');
    const user = await userStore.create({ email, passwordHash: hash });
    if (withPass) {
      await userStore.extendAccess(user.id, 24 * 3600_000, new Date());
    }
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'pass1234' }),
    });
    const token = cookieFromResponse(login);
    if (!token) throw new Error('no session');
    return token;
  }

  const paths = [
    '/api/coach/opening',
    '/api/coach/feedback',
    '/api/coach/feedback/stream',
    '/api/coach/hint',
    '/api/coach/hint/stream',
    '/api/coach/ask',
    '/api/coach/ask/stream',
    '/api/ai/move',
  ];

  it.each(paths)('guest %s gets 401 auth_required', async (path) => {
    const res = await app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-guest-id': 'guest-1' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'auth_required' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it.each(paths)('signed in without pass %s gets 402', async (path) => {
    const cookie = await sessionCookieFor('nopass@example.com', false);
    const res = await app.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-guest-id': 'guest-2',
        ...cookieHeader(cookie),
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: 'access_required' });
  });

  it('per-user rate limit shares bucket across guest ids', async () => {
    const cookie = await sessionCookieFor('rated@example.com', true);
    for (let i = 0; i < 30; i++) {
      const res = await app.request('/api/coach/opening', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-guest-id': `guest-${i}`,
          ...cookieHeader(cookie),
        },
        body: JSON.stringify({}),
      });
      expect(res.status).not.toBe(429);
    }
    const blocked = await app.request('/api/coach/opening', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-guest-id': 'another-guest',
        ...cookieHeader(cookie),
      },
      body: JSON.stringify({}),
    });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'rate_limit_exceeded' });
    expect(blocked.headers.get('cache-control')).toBe('no-store');
  });

  it('opponent/move stays open to guests and rate-limits by guest id', async () => {
    process.env.PLAY_OPPONENT_PROVIDER = 'llm';
    const guest = 'opp-guest-only';
    const body = { board: X.initialBoard(), side: 'r', difficulty: 'beginner' };
    for (let i = 0; i < 30; i++) {
      const res = await app.request('/api/opponent/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-guest-id': guest },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(503);
    }
    const blocked = await app.request('/api/opponent/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-guest-id': guest },
      body: JSON.stringify(body),
    });
    expect(blocked.status).toBe(429);
    delete process.env.PLAY_OPPONENT_PROVIDER;
  });

  it('two users with passes have independent rate limits', async () => {
    const cookieA = await sessionCookieFor('user-a@example.com', true);
    const cookieB = await sessionCookieFor('user-b@example.com', true);
    for (let i = 0; i < 30; i++) {
      await app.request('/api/coach/opening', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...cookieHeader(cookieA) },
        body: JSON.stringify({}),
      });
    }
    const resB = await app.request('/api/coach/opening', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cookieHeader(cookieB) },
      body: JSON.stringify({}),
    });
    expect(resB.status).not.toBe(429);
  });
});
