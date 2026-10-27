import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_DUMMY_PASSWORD_FOR_TIMING } from '../admin/users.js';
import { createSessionToken } from '../admin/session.js';
import { createApp } from '../app.js';
import { MemoryNewsStore } from '../news/memoryStore.js';
import { resetAdminAuthRateLimitsForTests } from '../middleware/adminAuth.js';

const ALICE = 'alice';
const BOB = 'bob';

function setupAdminEnv() {
  process.env.ADMIN_USERS = `${ALICE}:alice-pass,${BOB}:bob-pass`;
}

function loginBody(username: string, password: string) {
  return JSON.stringify({ username, password });
}

describe('admin session routes', () => {
  beforeEach(() => {
    resetAdminAuthRateLimitsForTests();
    setupAdminEnv();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.ADMIN_USERS;
    delete process.env.ADMIN_SESSION_TTL_HOURS;
    resetAdminAuthRateLimitsForTests();
    vi.restoreAllMocks();
  });

  it('POST /login returns 200 with token and no-store', async () => {
    const app = createApp({ newsStore: null });
    const res = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody(ALICE, 'alice-pass'),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; username: string; expiresAt: string };
    expect(body.username).toBe(ALICE);
    expect(body.token).toContain('.');
    expect(body.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('POST /login validates request body with 400 (not rate limited)', async () => {
    const app = createApp({ newsStore: null });

    for (let i = 0; i < 11; i++) {
      await app.request('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: loginBody(ALICE, 'wrong'),
      });
    }

    const badJson = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toEqual({ error: 'invalid_request' });

    const longUser = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody('x'.repeat(129), 'p'),
    });
    expect(longUser.status).toBe(400);
    expect(await longUser.json()).toEqual({ error: 'invalid_request' });

    const missingField = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ALICE }),
    });
    expect(missingField.status).toBe(400);
  });

  it('does not authenticate unknown user with the internal dummy password', async () => {
    const app = createApp({ newsStore: null });
    const res = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody('not-a-real-user', ADMIN_DUMMY_PASSWORD_FOR_TIMING),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_credentials' });
  });

  it('returns identical 401 for wrong password and unknown user', async () => {
    const app = createApp({ newsStore: null });
    const wrong = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody(ALICE, 'bad'),
    });
    const unknown = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody('nobody', 'bad'),
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'invalid_credentials' });
    expect(await unknown.json()).toEqual({ error: 'invalid_credentials' });
    expect(wrong.headers.get('cache-control')).toBe(unknown.headers.get('cache-control'));
  });

  it('empty-string username/password is 401 invalid_credentials', async () => {
    const app = createApp({ newsStore: null });
    const res = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody('', ''),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_credentials' });
  });

  it('rate-limits one ip+username without affecting another username', async () => {
    const app = createApp({ newsStore: null });
    for (let i = 0; i < 10; i++) {
      const res = await app.request('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: loginBody(ALICE, 'wrong'),
      });
      expect(res.status).toBe(401);
    }
    const lockedWrong = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody(ALICE, 'wrong'),
    });
    expect(lockedWrong.status).toBe(429);

    const lockedRight = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody(ALICE, 'alice-pass'),
    });
    expect(lockedRight.status).toBe(429);

    const bobOk = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody(BOB, 'bob-pass'),
    });
    expect(bobOk.status).toBe(200);
  });

  it('successful login clears the ip+username bucket', async () => {
    const app = createApp({ newsStore: null });
    for (let i = 0; i < 5; i++) {
      await app.request('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: loginBody(ALICE, 'wrong'),
      });
    }
    const ok = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody(ALICE, 'alice-pass'),
    });
    expect(ok.status).toBe(200);

    for (let i = 0; i < 10; i++) {
      const res = await app.request('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: loginBody(ALICE, 'wrong'),
      });
      expect(res.status).toBe(401);
    }
  });

  it('returns 503 admin_disabled when no users are configured', async () => {
    const token = createSessionToken(ALICE).token;
    process.env.ADMIN_USERS = '';
    const app = createApp({ newsStore: null });
    const login = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody(ALICE, 'alice-pass'),
    });
    expect(login.status).toBe(503);
    expect(await login.json()).toEqual({ error: 'admin_disabled' });

    const me = await app.request('/api/admin/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(503);
  });

  it('GET /me returns username for valid token', async () => {
    const app = createApp({ newsStore: null });
    const token = createSessionToken(ALICE).token;
    const res = await app.request('/api/admin/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: ALICE });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('GET /me returns 401 for missing token', async () => {
    const app = createApp({ newsStore: null });
    const res = await app.request('/api/admin/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('admin news and login coexist on createApp', async () => {
    const app = createApp({ newsStore: new MemoryNewsStore() });
    const login = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: loginBody(ALICE, 'alice-pass'),
    });
    expect(login.status).toBe(200);
    const { token } = (await login.json()) as { token: string };

    const news = await app.request('/api/admin/news', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(news.status).toBe(200);
    expect(news.headers.get('cache-control')).toBe('no-store');
  });
});
