import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createSessionToken } from '../admin/session.js';
import type { AppVariables } from '../types/hono.js';
import {
  adminAuth,
  failureBucketCountForTests,
  failureBucketKeysForTests,
  recordFailure,
  resetAdminAuthRateLimitsForTests,
  setMaxBucketsForTests,
} from './adminAuth.js';

const USER = 'admin';
const PASS = 'pass';

function appWithAuth() {
  const app = new Hono<{ Variables: AppVariables }>();
  app.use('*', adminAuth);
  app.get('/', (c) => c.json({ ok: true, user: c.get('adminUser') }));
  return app;
}

function setupEnv() {
  process.env.ADMIN_USERS = `${USER}:${PASS}`;
}

describe('adminAuth', () => {
  beforeEach(() => {
    resetAdminAuthRateLimitsForTests();
    setupEnv();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.ADMIN_USERS;
    resetAdminAuthRateLimitsForTests();
    vi.restoreAllMocks();
  });

  it('returns 503 when admin is disabled', async () => {
    delete process.env.ADMIN_USERS;
    const res = await appWithAuth().request('/', { headers: { Authorization: 'Bearer x' } });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'admin_disabled' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 401 when token is missing or wrong', async () => {
    const app = appWithAuth();
    const missing = await app.request('/');
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: 'unauthorized' });

    const wrong = await app.request('/', { headers: { Authorization: 'Bearer not.valid' } });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'unauthorized' });
  });

  it('allows a valid Bearer session token and sets adminUser', async () => {
    const token = createSessionToken(USER).token;
    const res = await appWithAuth().request('/', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, user: USER });
  });

  it('returns 429 after ten bad token attempts from the same remote key', async () => {
    const app = appWithAuth();
    for (let i = 0; i < 10; i++) {
      const res = await app.request('/', { headers: { Authorization: 'Bearer bad.token' } });
      expect(res.status).toBe(401);
    }
    const limited = await app.request('/', { headers: { Authorization: 'Bearer bad.token' } });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate_limited' });
  });

  describe('failure bucket cap', () => {
    beforeEach(() => {
      setMaxBucketsForTests(3);
    });

    it('evicts the oldest bucket when at cap and inserting a new key', () => {
      recordFailure('first');
      recordFailure('second');
      recordFailure('third');
      expect(failureBucketCountForTests()).toBe(3);
      expect(failureBucketKeysForTests()).toEqual(['first', 'second', 'third']);

      recordFailure('fourth');
      expect(failureBucketKeysForTests()).toEqual(['second', 'third', 'fourth']);
      expect(failureBucketCountForTests()).toBe(3);
    });

    it('drops expired buckets before evicting live ones', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      recordFailure('expired-soon');
      vi.setSystemTime(new Date('2026-01-01T00:14:00.000Z'));
      recordFailure('still-live');
      expect(failureBucketCountForTests()).toBe(2);

      vi.setSystemTime(new Date('2026-01-01T00:16:00.000Z'));
      recordFailure('new-key');
      expect(failureBucketKeysForTests()).toEqual(['still-live', 'new-key']);
      expect(failureBucketCountForTests()).toBe(2);
      vi.useRealTimers();
    });
  });

  it('does not count expired tokens toward the IP limiter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    const { token } = createSessionToken(USER);
    vi.setSystemTime(new Date('2026-01-20T12:00:00.000Z'));

    const app = appWithAuth();
    for (let i = 0; i < 12; i++) {
      const res = await app.request('/', { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
    vi.useRealTimers();
  });
});
