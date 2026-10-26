import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import {
  E2E_TEST_SECRET_HEADER,
  requireE2eTestSecret,
  resetE2eTestSecretForTests,
} from './testSecret.js';

describe('requireE2eTestSecret', () => {
  afterEach(() => {
    resetE2eTestSecretForTests();
  });

  it('returns 503 when E2E_TEST_SECRET is unset', async () => {
    const app = new Hono();
    app.get('/t', (c) => {
      const denied = requireE2eTestSecret(c);
      if (denied) return denied;
      return c.json({ ok: true });
    });
    const res = await app.request('/t');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'e2e_test_disabled' });
  });

  it('returns 403 when header is wrong', async () => {
    process.env.E2E_TEST_SECRET = 'correct-secret-value-here';
    const app = new Hono();
    app.get('/t', (c) => {
      const denied = requireE2eTestSecret(c);
      if (denied) return denied;
      return c.json({ ok: true });
    });
    const res = await app.request('/t', {
      headers: { [E2E_TEST_SECRET_HEADER]: 'wrong' },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('allows matching secret', async () => {
    process.env.E2E_TEST_SECRET = 'correct-secret-value-here';
    const app = new Hono();
    app.get('/t', (c) => {
      const denied = requireE2eTestSecret(c);
      if (denied) return denied;
      return c.json({ ok: true });
    });
    const res = await app.request('/t', {
      headers: { [E2E_TEST_SECRET_HEADER]: 'correct-secret-value-here' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
