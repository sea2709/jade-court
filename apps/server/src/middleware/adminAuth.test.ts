import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { adminAuth, resetAdminAuthRateLimitsForTests } from './adminAuth.js';

const TOKEN = 'test-admin-token-secret';

function appWithAuth() {
  const app = new Hono();
  app.use('*', adminAuth);
  app.get('/', (c) => c.json({ ok: true }));
  return app;
}

describe('adminAuth', () => {
  beforeEach(() => {
    resetAdminAuthRateLimitsForTests();
    process.env.ADMIN_TOKEN = TOKEN;
  });

  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
    resetAdminAuthRateLimitsForTests();
  });

  it('returns 503 when ADMIN_TOKEN is unset', async () => {
    delete process.env.ADMIN_TOKEN;
    const res = await appWithAuth().request('/', { headers: { Authorization: 'Bearer x' } });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'admin_disabled' });
  });

  it('returns 401 when token is missing or wrong', async () => {
    const app = appWithAuth();
    const missing = await app.request('/');
    expect(missing.status).toBe(401);

    const wrong = await app.request('/', { headers: { Authorization: 'Bearer wrong' } });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'unauthorized' });
  });

  it('allows a valid Bearer token', async () => {
    const res = await appWithAuth().request('/', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 429 after ten failed attempts from the same remote key', async () => {
    const app = appWithAuth();
    for (let i = 0; i < 10; i++) {
      const res = await app.request('/', { headers: { Authorization: 'Bearer bad' } });
      expect(res.status).toBe(401);
    }
    const limited = await app.request('/', { headers: { Authorization: 'Bearer bad' } });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate_limited' });
  });
});
