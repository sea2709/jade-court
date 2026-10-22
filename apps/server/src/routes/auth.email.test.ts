import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { SESSION_COOKIE_NAME } from '../auth/config.js';
import { getConsoleEmailOutbox, resetConsoleEmailOutboxForTests } from '../email/consoleSender.js';
import { resetPlayerAuthRateLimitsForTests } from '../auth/rateLimit.js';
import { hashSessionToken } from '../auth/sessionToken.js';
import { MemoryEmailTokenStore } from '../emailTokens/memoryStore.js';
import { MemorySessionStore } from '../users/memorySessionStore.js';
import { MemoryUserStore } from '../users/memoryStore.js';
import * as passwordModule from '../users/password.js';

const SECRET = 'test-session-secret-0123456789abcdef0123456789ab';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function setupAuthEnv() {
  process.env.SESSION_SECRET = SECRET;
  process.env.NODE_ENV = 'test';
  process.env.PUBLIC_APP_URL = 'http://localhost:5199';
  process.env.EMAIL_PROVIDER = 'console';
}

function makeApp() {
  const userStore = new MemoryUserStore();
  const sessionStore = new MemorySessionStore();
  const emailTokenStore = new MemoryEmailTokenStore();
  return {
    app: createApp({
      newsStore: null,
      userStore,
      sessionStore,
      emailTokenStore,
    }),
    userStore,
    sessionStore,
    emailTokenStore,
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

function extractVerifyTokenFromOutbox(): string {
  const msg = getConsoleEmailOutbox().at(-1);
  expect(msg).toBeTruthy();
  const link = msg!.links.find((l) => l.includes('/verify-email?token='));
  expect(link).toBeTruthy();
  const token = new URL(link!).searchParams.get('token');
  expect(token).toBeTruthy();
  return token!;
}

async function waitForOutbox(min = 1, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (getConsoleEmailOutbox().length >= min) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out waiting for email outbox');
}

async function register(app: ReturnType<typeof createApp>, email: string, password: string) {
  return app.request('/api/auth/register', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password }),
  });
}

describe('auth email routes', () => {
  beforeEach(() => {
    resetPlayerAuthRateLimitsForTests();
    resetConsoleEmailOutboxForTests();
    passwordModule.resetDummyPasswordHashForTests();
    setupAuthEnv();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.NODE_ENV;
    delete process.env.PUBLIC_APP_URL;
    delete process.env.EMAIL_PROVIDER;
    resetPlayerAuthRateLimitsForTests();
    resetConsoleEmailOutboxForTests();
    passwordModule.resetDummyPasswordHashForTests();
    vi.restoreAllMocks();
  });

  it('register sends verification email without blocking response', async () => {
    const { app } = makeApp();
    const res = await register(app, 'verify-me@example.com', 'password123');
    expect(res.status).toBe(201);
    await waitForOutbox();
    const msg = getConsoleEmailOutbox()[0]!;
    expect(msg.to).toBe('verify-me@example.com');
    expect(msg.links.some((l) => l.includes('/verify-email?token='))).toBe(true);
  });

  it('POST /verify marks email verified and sets session when signed out', async () => {
    const { app } = makeApp();
    await register(app, 'v@example.com', 'password123');
    await waitForOutbox();
    const token = extractVerifyTokenFromOutbox();

    const res = await app.request('/api/auth/verify', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { emailVerified: boolean } };
    expect(body.user.emailVerified).toBe(true);
    expect(cookieFromResponse(res)).toBeTruthy();
  });

  it('POST /verify rejects invalid token with 401', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/auth/verify', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ token: 'not-a-real-token' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_token' });
  });

  it('POST /verify consumes token (single use)', async () => {
    const { app } = makeApp();
    await register(app, 'once@example.com', 'password123');
    await waitForOutbox();
    const token = extractVerifyTokenFromOutbox();

    const ok = await app.request('/api/auth/verify', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ token }),
    });
    expect(ok.status).toBe(200);

    const again = await app.request('/api/auth/verify', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ token }),
    });
    expect(again.status).toBe(401);
  });

  it('POST /verify rejects wrong signed-in user without consuming token', async () => {
    const { app, userStore } = makeApp();
    await register(app, 'victim@example.com', 'password123');
    await waitForOutbox();
    const victimToken = extractVerifyTokenFromOutbox();

    const attackerReg = await register(app, 'attacker@example.com', 'password456');
    const attackerSession = cookieFromResponse(attackerReg)!;

    const blocked = await app.request('/api/auth/verify', {
      method: 'POST',
      headers: { ...JSON_HEADERS, ...sessionCookieHeader(attackerSession) },
      body: JSON.stringify({ token: victimToken }),
    });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: 'wrong_account' });

    const victim = await userStore.findByEmail('victim@example.com');
    expect(victim?.emailVerified).toBe(false);

    const victimOk = await app.request('/api/auth/verify', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ token: victimToken }),
    });
    expect(victimOk.status).toBe(200);
    expect((await victimOk.json()).user.emailVerified).toBe(true);
  });

  it('POST /resend-verification requires session', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/auth/resend-verification', {
      method: 'POST',
      headers: JSON_HEADERS,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('POST /resend-verification sends email when signed in and unverified', async () => {
    const { app } = makeApp();
    const reg = await register(app, 'resend@example.com', 'password123');
    const session = cookieFromResponse(reg)!;
    await waitForOutbox();
    resetConsoleEmailOutboxForTests();

    const res = await app.request('/api/auth/resend-verification', {
      method: 'POST',
      headers: sessionCookieHeader(session),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    await waitForOutbox();
  });

  it('POST /resend-verification is no-op when already verified', async () => {
    const { app, userStore } = makeApp();
    const reg = await register(app, 'done@example.com', 'password123');
    const session = cookieFromResponse(reg)!;
    const user = (await userStore.findByEmail('done@example.com'))!;
    await userStore.setEmailVerified(user.id, true);
    resetConsoleEmailOutboxForTests();

    const res = await app.request('/api/auth/resend-verification', {
      method: 'POST',
      headers: sessionCookieHeader(session),
    });
    expect(res.status).toBe(200);
    expect(getConsoleEmailOutbox()).toHaveLength(0);
  });

  it('POST /forgot-password always returns check_your_email', async () => {
    const { app } = makeApp();
    await register(app, 'fp@example.com', 'password123');
    await waitForOutbox();
    resetConsoleEmailOutboxForTests();

    const unknown = await app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: 'missing@example.com' }),
    });
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual({ ok: true, message: 'check_your_email' });

    const known = await app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: 'fp@example.com' }),
    });
    expect(known.status).toBe(200);
    expect(await known.json()).toEqual({ ok: true, message: 'check_your_email' });
    await waitForOutbox();
    expect(getConsoleEmailOutbox()).toHaveLength(1);
  });

  it('POST /reset-password updates password, revokes other sessions, sets new cookie', async () => {
    const { app, sessionStore } = makeApp();
    await register(app, 'reset@example.com', 'password123');
    await waitForOutbox();

    const loginA = await app.request('/api/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: 'reset@example.com', password: 'password123' }),
    });
    const cookieA = cookieFromResponse(loginA)!;
    const hashA = hashSessionToken(cookieA);

    await app.request('/api/auth/forgot-password', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: 'reset@example.com' }),
    });
    await waitForOutbox(2);

    const resetLink = getConsoleEmailOutbox()
      .flatMap((m) => m.links)
      .find((l) => l.includes('/reset-password?token='));
    expect(resetLink).toBeTruthy();
    const resetToken = new URL(resetLink!).searchParams.get('token')!;

    const resetRes = await app.request('/api/auth/reset-password', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ token: resetToken, password: 'newpassword99' }),
    });
    expect(resetRes.status).toBe(200);
    const newCookie = cookieFromResponse(resetRes)!;
    expect(newCookie).toBeTruthy();

    expect(await sessionStore.findByTokenHash(hashA)).toBeNull();

    const oldMe = await app.request('/api/me', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${cookieA}` },
    });
    expect((await oldMe.json()).user).toBeNull();

    const loginNew = await app.request('/api/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: 'reset@example.com', password: 'newpassword99' }),
    });
    expect(loginNew.status).toBe(200);
  });

  it('GET /api/auth/test-email-outbox returns captured messages in test env', async () => {
    const { app } = makeApp();
    await register(app, 'outbox@example.com', 'password123');
    await waitForOutbox();

    const res = await app.request('/api/auth/test-email-outbox');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: unknown[] };
    expect(body.messages.length).toBeGreaterThan(0);
  });

  it('GET /api/auth/test-email-outbox is not mounted outside test env', async () => {
    process.env.NODE_ENV = 'development';
    const { app } = makeApp();
    const res = await app.request('/api/auth/test-email-outbox');
    expect(res.status).toBe(404);
    process.env.NODE_ENV = 'test';
  });
});
