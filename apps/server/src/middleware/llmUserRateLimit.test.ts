import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { resetRateLimitsForTests } from '../llm/rateLimit.js';
import type { AppVariables } from '../types/hono.js';
import { llmUserRateLimit } from './llmUserRateLimit.js';

describe('llmUserRateLimit', () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  afterEach(() => {
    resetRateLimitsForTests();
  });

  it('returns 429 with Cache-Control no-store when exceeded', async () => {
    const app = new Hono<{ Variables: AppVariables }>();
    app.use('*', async (c, next) => {
      c.set('user', {
        id: 'rate-user',
        email: null,
        emailVerified: false,
        displayName: null,
        accessUntil: null,
        preferredModelId: null,
        createdAt: new Date(),
      });
      await next();
    });
    app.use('*', llmUserRateLimit);
    app.post('/probe', (c) => c.json({ ok: true }));

    for (let i = 0; i < 30; i++) {
      expect((await app.request('/probe', { method: 'POST' })).status).toBe(200);
    }
    const res = await app.request('/probe', { method: 'POST' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limit_exceeded' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
