import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { SESSION_COOKIE_NAME } from '../auth/config.js';
import { createAuthMiddleware, requireUser } from './auth.js';
import type { AppVariables } from '../types/hono.js';
import { MemorySessionStore } from '../users/memorySessionStore.js';
import { MemoryUserStore } from '../users/memoryStore.js';
import { hashPassword } from '../users/password.js';
import { generateSessionToken, hashSessionToken } from '../auth/sessionToken.js';

const SECRET = 'test-session-secret-0123456789abcdef0123456789ab';

describe('createAuthMiddleware', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
  });

  it('requireUser returns 401 when guest', async () => {
    const userStore = new MemoryUserStore();
    const sessionStore = new MemorySessionStore();
    const app = new Hono<{ Variables: AppVariables }>();
    app.use('*', createAuthMiddleware({ userStore, sessionStore }));
    app.get('/protected', requireUser, (c) => c.json({ ok: true }));

    const res = await app.request('/protected');
    expect(res.status).toBe(401);
  });

  it('sets user when session cookie is valid', async () => {
    const userStore = new MemoryUserStore();
    const sessionStore = new MemorySessionStore();
    const user = await userStore.create({
      email: 'u@test.com',
      passwordHash: await hashPassword('pw'),
    });
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + 3600_000);
    await sessionStore.create({
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt,
    });

    const app = new Hono<{ Variables: AppVariables }>();
    app.use('*', createAuthMiddleware({ userStore, sessionStore }));
    app.get('/who', (c) => c.json({ id: c.get('user')?.id ?? null }));

    const res = await app.request('/who', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: user.id });
  });
});
