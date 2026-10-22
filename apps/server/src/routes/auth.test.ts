import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { SESSION_COOKIE_NAME } from '../auth/config.js';
import { hashSessionToken } from '../auth/sessionToken.js';
import {
  resetPlayerAuthRateLimitsForTests,
  setLoginFailedVolumeMaxForTests,
  setRegisterGlobalMaxForTests,
} from '../auth/rateLimit.js';
import { MemorySessionStore } from '../users/memorySessionStore.js';
import { MemoryUserStore } from '../users/memoryStore.js';
import * as passwordModule from '../users/password.js';
import { hashPassword } from '../users/password.js';
import type { SessionStore } from '../users/sessionStore.js';

const SECRET = 'test-session-secret-0123456789abcdef0123456789ab';

function setupAuthEnv() {
  process.env.SESSION_SECRET = SECRET;
  process.env.NODE_ENV = 'test';
}

function makeApp(sessionStore?: SessionStore) {
  const userStore = new MemoryUserStore();
  const sessions = sessionStore ?? new MemorySessionStore();
  return {
    app: createApp({ newsStore: null, userStore, sessionStore: sessions }),
    userStore,
    sessionStore: sessions,
  };
}

function cookieFromResponse(res: Response): string | undefined {
  const raw = res.headers.get('set-cookie');
  if (!raw) return undefined;
  const re = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`);
  return raw.match(re)?.[1];
}

function sessionCookieHeader(token: string): Record<string, string> {
  return {
    Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    'Content-Type': 'application/json',
  };
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function register(
  app: ReturnType<typeof createApp>,
  email: string,
  password: string,
  displayName?: string,
  extraHeaders?: Record<string, string>,
) {
  return app.request('/api/auth/register', {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify({ email, password, ...(displayName ? { displayName } : {}) }),
  });
}

async function login(
  app: ReturnType<typeof createApp>,
  email: string,
  password: string,
  extraHeaders?: Record<string, string>,
) {
  return app.request('/api/auth/login', {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify({ email, password }),
  });
}

describe('player auth routes', () => {
  beforeEach(() => {
    resetPlayerAuthRateLimitsForTests();
    passwordModule.resetDummyPasswordHashForTests();
    setupAuthEnv();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.SESSION_TTL_HOURS;
    delete process.env.NODE_ENV;
    resetPlayerAuthRateLimitsForTests();
    passwordModule.resetDummyPasswordHashForTests();
    vi.restoreAllMocks();
  });

  it('register returns 201 with user and session cookie', async () => {
    const { app } = makeApp();
    const res = await register(app, 'player@example.com', 'password123', 'Dang');
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      user: {
        id: string;
        email: string;
        displayName: string;
        emailVerified: boolean;
      };
    };
    expect(body.user.email).toBe('player@example.com');
    expect(body.user.displayName).toBe('Dang');
    expect(body.user.emailVerified).toBe(false);
    expect(cookieFromResponse(res)).toBeTruthy();
    expect(res.headers.get('cache-control')).toBe('no-store');

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Secure');
  });

  it('login returns 200 and sets cookie', async () => {
    const { app, userStore } = makeApp();
    const hash = await hashPassword('secret-pass');
    await userStore.create({ email: 'a@b.com', passwordHash: hash });

    const res = await login(app, 'a@b.com', 'secret-pass');
    expect(res.status).toBe(200);
    expect(cookieFromResponse(res)).toBeTruthy();
  });

  it('login returns generic invalid_credentials for wrong password', async () => {
    const { app, userStore } = makeApp();
    const hash = await hashPassword('right');
    await userStore.create({ email: 'x@y.com', passwordHash: hash });

    const res = await login(app, 'x@y.com', 'wrong');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_credentials' });

    const unknown = await login(app, 'nobody@y.com', 'wrong');
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual({ error: 'invalid_credentials' });
  });

  it('register duplicate email returns 409 email_taken', async () => {
    const { app } = makeApp();
    await register(app, 'dup@example.com', 'password123');
    const res = await register(app, 'dup@example.com', 'password456');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'email_taken' });
  });

  it('rate limits login after repeated failures', async () => {
    const { app } = makeApp();
    for (let i = 0; i < 10; i++) {
      const res = await login(app, 'victim@example.com', 'bad');
      expect(res.status).toBe(401);
    }
    const limited = await login(app, 'victim@example.com', 'bad');
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate_limited' });
  });

  it('limits concurrent login verifications to 10 per window', async () => {
    const { app, userStore } = makeApp();
    const hash = await hashPassword('real-pass');
    await userStore.create({ email: 'burst@example.com', passwordHash: hash });

    let verifyCalls = 0;
    const realVerify = passwordModule.verifyLoginPassword;
    vi.spyOn(passwordModule, 'verifyLoginPassword').mockImplementation(async (...args) => {
      verifyCalls += 1;
      return realVerify(...args);
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => login(app, 'burst@example.com', `guess-${i}`)),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 401).length).toBe(10);
    expect(statuses.filter((s) => s === 429).length).toBe(10);
    expect(verifyCalls).toBe(10);
  });

  it('does not lock other emails after 10 failures for one email behind same peer', async () => {
    const { app, userStore } = makeApp();
    const hash = await hashPassword('other-pass');
    await userStore.create({ email: 'other@example.com', passwordHash: hash });

    for (let i = 0; i < 10; i++) {
      await login(app, 'victim@example.com', 'bad');
    }
    const victimLimited = await login(app, 'victim@example.com', 'bad');
    expect(victimLimited.status).toBe(429);

    const otherOk = await login(app, 'other@example.com', 'other-pass');
    expect(otherOk.status).toBe(200);
  });

  it('does not use X-Forwarded-For for login rate-limit keys', async () => {
    const { app } = makeApp();
    for (let i = 0; i < 10; i++) {
      await login(app, 'victim@example.com', 'bad', { 'X-Forwarded-For': '1.2.3.4' });
    }
    const withSpoof = await login(app, 'victim@example.com', 'bad', {
      'X-Forwarded-For': '9.9.9.9',
    });
    expect(withSpoof.status).toBe(429);
  });

  it('rejects non-JSON content types without setting a cookie', async () => {
    const { app, userStore } = makeApp();
    const hash = await hashPassword('password123');
    await userStore.create({ email: 'attacker@example.com', passwordHash: hash });

    const plain = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ email: 'attacker@example.com', password: 'password123' }),
    });
    expect(plain.status).toBe(400);
    expect(await plain.json()).toEqual({ error: 'invalid_request' });
    expect(plain.headers.get('set-cookie')).toBeNull();

    const form = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'email=attacker%40example.com&password=password123',
    });
    expect(form.status).toBe(400);
    expect(form.headers.get('set-cookie')).toBeNull();
  });

  it('does not cap register per proxy peer (only global)', async () => {
    const { app } = makeApp();
    for (let i = 0; i < 11; i++) {
      const res = await register(app, `peer${i}@example.com`, 'password123');
      expect(res.status).toBe(201);
    }
  });

  it('rate limits register on global budget before hashing', async () => {
    setRegisterGlobalMaxForTests(10);
    const { app } = makeApp();
    const realHash = passwordModule.hashPassword;
    let hashCalls = 0;
    vi.spyOn(passwordModule, 'hashPassword').mockImplementation(async (...args) => {
      hashCalls += 1;
      return realHash(...args);
    });

    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await register(app, `user${i}@example.com`, 'password123');
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 201).length).toBe(10);
    expect(statuses.filter((s) => s === 429).length).toBe(2);
    expect(hashCalls).toBe(10);
  });

  it('rate limits failed-login volume when rotating emails', async () => {
    setLoginFailedVolumeMaxForTests(10);
    const { app } = makeApp();

    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await login(app, `rotate-${i}@example.com`, 'wrong-pass');
      statuses.push(res.status);
    }

    expect(statuses.filter((s) => s === 401).length).toBe(10);
    expect(statuses.filter((s) => s === 429).length).toBe(2);
  });

  it('allows correct login after failed-login volume exhausted via email rotation', async () => {
    setLoginFailedVolumeMaxForTests(10);
    const { app } = makeApp();

    for (let i = 0; i < 10; i++) {
      const res = await login(app, `burn-${i}@example.com`, 'wrong-pass');
      expect(res.status).toBe(401);
    }
    expect((await login(app, 'burn-10@example.com', 'wrong-pass')).status).toBe(429);

    await register(app, 'fresh@example.com', 'password123');
    const ok = await login(app, 'fresh@example.com', 'password123');
    expect(ok.status).toBe(200);
    expect(cookieFromResponse(ok)).toBeTruthy();
  });

  it('allows correct login for another email when only per-email failure cap applies', async () => {
    const { app, userStore } = makeApp();
    const hash = await hashPassword('good-pass');
    await userStore.create({ email: 'good@example.com', passwordHash: hash });

    for (let i = 0; i < 10; i++) {
      await login(app, 'victim@example.com', 'bad');
    }
    const victimBlocked = await login(app, 'victim@example.com', 'bad');
    expect(victimBlocked.status).toBe(429);

    const other = await login(app, 'good@example.com', 'good-pass');
    expect(other.status).toBe(200);
  });

  it('logout revokes session and clears cookie', async () => {
    const { app } = makeApp();
    const reg = await register(app, 'out@example.com', 'password123');
    const token = cookieFromResponse(reg);
    expect(token).toBeTruthy();

    const meBefore = await app.request('/api/me', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect((await meBefore.json()).user).not.toBeNull();

    const logout = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: sessionCookieHeader(token!),
    });
    expect(logout.status).toBe(200);
    expect(await logout.json()).toEqual({ ok: true });
    const cleared = logout.headers.get('set-cookie') ?? '';
    expect(cleared).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cleared).toMatch(/Max-Age=0/i);

    const meAfter = await app.request('/api/me', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const body = await meAfter.json();
    expect(body.user).toBeNull();
  });

  it('logout clears cookie when session delete throws', async () => {
    const base = new MemorySessionStore();
    const sessionStore: SessionStore = {
      create: (r) => base.create(r),
      findByTokenHash: (h) => base.findByTokenHash(h),
      deleteByTokenHash: async () => {
        throw new Error('db down');
      },
      deleteAllForUser: (userId, except) => base.deleteAllForUser(userId, except),
    };
    const { app } = makeApp(sessionStore);
    const reg = await register(app, 'fail@example.com', 'password123');
    const token = cookieFromResponse(reg)!;

    const logout = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: sessionCookieHeader(token),
    });
    expect(logout.status).toBe(500);
    expect(await logout.json()).toEqual({ error: 'logout_failed' });
    expect(logout.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
  });

  it('logout without cookie does not emit Set-Cookie', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: JSON_HEADERS,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('expired session is treated as signed out', async () => {
    const { app, sessionStore } = makeApp();
    const reg = await register(app, 'exp@example.com', 'password123');
    const token = cookieFromResponse(reg)!;
    const tokenHash = hashSessionToken(token);
    sessionStore.expireForTests(tokenHash);

    const me = await app.request('/api/me', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const body = await me.json();
    expect(body.user).toBeNull();
    expect(body.access).toEqual({ active: false, accessUntil: null });
  });

  it('GET /api/me signed out', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: null,
      access: { active: false, accessUntil: null },
    });
  });

  it('GET /api/me signed in', async () => {
    const { app } = makeApp();
    const reg = await register(app, 'me@example.com', 'password123');
    const token = cookieFromResponse(reg)!;

    const me = await app.request('/api/me', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const body = (await me.json()) as {
      user: { email: string };
      access: { active: boolean; accessUntil: string | null };
    };
    expect(body.user.email).toBe('me@example.com');
    expect(body.access).toEqual({ active: false, accessUntil: null });
  });

  it('sets Secure on session cookie in production', async () => {
    process.env.NODE_ENV = 'production';
    const { app } = makeApp();
    const res = await register(app, 'secure@example.com', 'password123');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('Secure');
    process.env.NODE_ENV = 'test';
  });

  it('returns auth_disabled in production without SESSION_SECRET', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;
    const { app } = makeApp();
    const res = await register(app, 'no@example.com', 'password123');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'auth_disabled' });
    expect(res.headers.get('set-cookie')).toBeNull();
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = SECRET;
  });

  it('returns auth_disabled when NODE_ENV is unset and SESSION_SECRET is missing', async () => {
    delete process.env.NODE_ENV;
    delete process.env.SESSION_SECRET;
    const { app } = makeApp();
    const res = await register(app, 'start@example.com', 'password123');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'auth_disabled' });
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = SECRET;
  });

  it('register rejects invalid request', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: 'not-an-email', password: 'short' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_request' });
  });
});
