import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { requirePlayAccess } from './playAccess.js';
import type { AppVariables } from '../types/hono.js';

function appWithUser(user: AppVariables['user']) {
  const app = new Hono<{ Variables: AppVariables }>();
  app.use('*', async (c, next) => {
    c.set('user', user);
    await next();
  });
  app.use('*', requirePlayAccess);
  app.get('/probe', (c) => c.json({ ok: true }));
  return app;
}

const now = Date.now();

describe('requirePlayAccess', () => {
  it('returns 401 auth_required for guests', async () => {
    const res = await appWithUser(null).request('/probe');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'auth_required' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 402 access_required without active pass', async () => {
    const res = await appWithUser({
      id: 'u1',
      email: 'a@b.com',
      emailVerified: false,
      displayName: null,
      accessUntil: null,
      preferredModelId: null,
      createdAt: new Date(),
    }).request('/probe');
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: 'access_required' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('passes through with active access', async () => {
    const res = await appWithUser({
      id: 'u1',
      email: 'a@b.com',
      emailVerified: false,
      displayName: null,
      accessUntil: new Date(now + 60_000),
      preferredModelId: null,
      createdAt: new Date(),
    }).request('/probe');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
