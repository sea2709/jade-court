import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken } from '../admin/session.js';
import { MAX_PLAY_AI_ACCESS_HOURS, resetBillingConfigForTests } from '../billing/config.js';
import { createApp } from '../app.js';
import { resetAdminAuthRateLimitsForTests } from '../middleware/adminAuth.js';
import { MemorySessionStore } from '../users/memorySessionStore.js';
import { MemoryUserStore } from '../users/memoryStore.js';
import { hashPassword } from '../users/password.js';

const PLAYER_SECRET = 'test-session-secret-0123456789abcdef0123456789ab';

function setupEnv() {
  process.env.ADMIN_USERS = 'alice:alice-pass';
  process.env.SESSION_SECRET = PLAYER_SECRET;
  process.env.NODE_ENV = 'test';
}

describe('POST /api/admin/users/:id/grant', () => {
  let userStore: MemoryUserStore;
  let app: ReturnType<typeof createApp>;
  let playerId: string;

  beforeEach(async () => {
    resetAdminAuthRateLimitsForTests();
    setupEnv();
    userStore = new MemoryUserStore();
    app = createApp({ newsStore: null, userStore, sessionStore: new MemorySessionStore() });
    const user = await userStore.create({
      email: 'player@example.com',
      passwordHash: await hashPassword('pw'),
    });
    playerId = user.id;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.ADMIN_USERS;
    delete process.env.SESSION_SECRET;
    delete process.env.NODE_ENV;
    resetBillingConfigForTests();
    resetAdminAuthRateLimitsForTests();
    vi.restoreAllMocks();
  });

  function adminAuth() {
    return { Authorization: `Bearer ${createSessionToken('alice').token}` };
  }

  it('returns 401 without admin token', async () => {
    const res = await app.request(`/api/admin/users/${playerId}/grant`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown user', async () => {
    const res = await app.request('/api/admin/users/not-a-uuid/grant', {
      method: 'POST',
      headers: { ...adminAuth(), 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'user_not_found' });
  });

  it('returns 400 for invalid hours or body', async () => {
    const badJson = await app.request(`/api/admin/users/${playerId}/grant`, {
      method: 'POST',
      headers: { ...adminAuth(), 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(badJson.status).toBe(400);

    const negative = await app.request(`/api/admin/users/${playerId}/grant`, {
      method: 'POST',
      headers: { ...adminAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours: -1 }),
    });
    expect(negative.status).toBe(400);
    expect(await negative.json()).toEqual({ error: 'invalid_request' });

    const overCap = await app.request(`/api/admin/users/${playerId}/grant`, {
      method: 'POST',
      headers: { ...adminAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours: MAX_PLAY_AI_ACCESS_HOURS + 1 }),
    });
    expect(overCap.status).toBe(400);
    expect(await overCap.json()).toEqual({ error: 'invalid_request' });
  });

  it('default grant uses playAiAccessHours capped by MAX_PLAY_AI_ACCESS_HOURS', async () => {
    process.env.PLAY_AI_ACCESS_HOURS = '20000';
    const before = Date.now();
    const res = await app.request(`/api/admin/users/${playerId}/grant`, {
      method: 'POST',
      headers: { ...adminAuth(), 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access: { accessUntil: string | null } };
    const until = Date.parse(body.access.accessUntil!);
    const expectedMs = MAX_PLAY_AI_ACCESS_HOURS * 60 * 60 * 1000;
    expect(until - before).toBeGreaterThanOrEqual(expectedMs - 5000);
    expect(until - before).toBeLessThanOrEqual(expectedMs + 5000);
  });

  it('grants default hours and stacks on second grant', async () => {
    const first = await app.request(`/api/admin/users/${playerId}/grant`, {
      method: 'POST',
      headers: { ...adminAuth(), 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-store');
    const body1 = (await first.json()) as {
      user: { id: string };
      access: { active: boolean; accessUntil: string | null };
    };
    expect(body1.user.id).toBe(playerId);
    expect(body1.access.active).toBe(true);
    expect(body1.access.accessUntil).toBeTruthy();

    const second = await app.request(`/api/admin/users/${playerId}/grant`, {
      method: 'POST',
      headers: { ...adminAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours: 12 }),
    });
    const body2 = (await second.json()) as { access: { accessUntil: string | null } };
    expect(Date.parse(body2.access.accessUntil!)).toBeGreaterThan(
      Date.parse(body1.access.accessUntil!),
    );
  });
});
