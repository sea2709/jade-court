import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken } from '../admin/session.js';
import { MemoryPaymentStore } from '../billing/payments/memoryStore.js';
import { createApp } from '../app.js';
import { resetAdminAuthRateLimitsForTests } from '../middleware/adminAuth.js';
import { MemorySessionStore } from '../users/memorySessionStore.js';
import { MemoryUserStore } from '../users/memoryStore.js';
import { hashPassword } from '../users/password.js';

const ADMIN_SECRET = 'test-session-secret-0123456789abcdef0123456789ab';

function setupEnv() {
  process.env.ADMIN_USERS = 'alice:alice-pass';
  process.env.ADMIN_SESSION_SECRET = ADMIN_SECRET;
  process.env.SESSION_SECRET = ADMIN_SECRET;
  process.env.NODE_ENV = 'test';
}

describe('admin users and payments API', () => {
  let userStore: MemoryUserStore;
  let paymentStore: MemoryPaymentStore;
  let app: ReturnType<typeof createApp>;
  let playerA: string;
  let playerB: string;

  beforeEach(async () => {
    resetAdminAuthRateLimitsForTests();
    setupEnv();
    userStore = new MemoryUserStore();
    paymentStore = new MemoryPaymentStore();
    app = createApp({
      newsStore: null,
      userStore,
      sessionStore: new MemorySessionStore(),
      paymentStore,
    });

    const a = await userStore.create({
      email: 'alpha@example.com',
      passwordHash: await hashPassword('pw'),
      displayName: 'Alpha',
    });
    playerA = a.id;
    await userStore.setEmailVerified(playerA, true);
    await userStore.extendAccess(playerA, 60 * 60 * 1000, new Date());

    const b = await userStore.create({
      email: 'beta@example.org',
      passwordHash: await hashPassword('pw'),
    });
    playerB = b.id;

    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.ADMIN_USERS;
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.NODE_ENV;
    resetAdminAuthRateLimitsForTests();
    vi.restoreAllMocks();
  });

  function adminAuth() {
    return { Authorization: `Bearer ${createSessionToken('alice').token}` };
  }

  it('returns 401 without admin token on protected routes', async () => {
    for (const path of [
      '/api/admin/users?q=example',
      `/api/admin/users/${playerA}`,
      '/api/admin/payments',
      `/api/admin/users/${playerA}/revoke`,
    ]) {
      const method = path.includes('/revoke') ? 'POST' : 'GET';
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    }
  });

  it('GET /users returns 400 invalid_query when q is missing or blank', async () => {
    const missing = await app.request('/api/admin/users', { headers: adminAuth() });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'invalid_query' });

    const blank = await app.request('/api/admin/users?q=%20%20', { headers: adminAuth() });
    expect(blank.status).toBe(400);
    expect(await blank.json()).toEqual({ error: 'invalid_query' });

    const tooLong = await app.request(`/api/admin/users?q=${'a'.repeat(257)}`, {
      headers: adminAuth(),
    });
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toEqual({ error: 'invalid_query' });
  });

  it('GET /users finds user by exact UUID when q is a valid user id', async () => {
    const byId = await userStore.create({
      email: 'by-id@example.com',
      passwordHash: 'hash',
    });
    const res = await app.request(`/api/admin/users?q=${byId.id}`, {
      headers: adminAuth(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { id: string }[] };
    expect(body.users.some((u) => u.id === byId.id)).toBe(true);
  });

  it('GET /users searches by email substring with summaries', async () => {
    const res = await app.request('/api/admin/users?q=alpha@', { headers: adminAuth() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: { id: string; email: string; displayName: string | null }[];
      nextCursor: string | null;
    };
    expect(body.nextCursor).toBeNull();
    expect(body.users).toHaveLength(1);
    expect(body.users[0]?.id).toBe(playerA);
    expect(body.users[0]?.email).toBe('alpha@example.com');
    expect(body.users[0]?.displayName).toBe('Alpha');
  });

  it('GET /users supports cursor pagination', async () => {
    for (let i = 0; i < 3; i++) {
      await userStore.create({
        email: `paginate${i}@search.test`,
        passwordHash: 'hash',
      });
    }
    const first = await app.request('/api/admin/users?q=search.test&limit=2', {
      headers: adminAuth(),
    });
    expect(first.status).toBe(200);
    const page1 = (await first.json()) as { users: { id: string }[]; nextCursor: string };
    expect(page1.users).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const second = await app.request(
      `/api/admin/users?q=search.test&limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
      { headers: adminAuth() },
    );
    const page2 = (await second.json()) as { users: { id: string }[]; nextCursor: string | null };
    expect(page2.users.length).toBeGreaterThanOrEqual(1);
    expect(page1.users[0]?.id).not.toBe(page2.users[0]?.id);

    const badCursor = await app.request('/api/admin/users?q=search.test&cursor=not-valid', {
      headers: adminAuth(),
    });
    expect(badCursor.status).toBe(400);
    expect(await badCursor.json()).toEqual({ error: 'invalid_cursor' });
  });

  it('GET /users/:id returns profile, access, identities, payments without passwordHash', async () => {
    const now = new Date();
    await paymentStore.insertIfNotExists({
      stripeSessionId: 'cs_test_1',
      userId: playerA,
      amount: 500,
      currency: 'usd',
      grantedFrom: now,
      grantedUntil: new Date(now.getTime() + 86400000),
      status: 'paid',
      createdAt: now,
    });

    const res = await app.request(`/api/admin/users/${playerA}`, { headers: adminAuth() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('passwordHash');
    expect(body.user).toMatchObject({
      id: playerA,
      email: 'alpha@example.com',
      emailVerified: true,
    });
    expect(body.identities).toEqual([]);
    expect(body.access).toMatchObject({ active: true });
    expect((body.payments as unknown[]).length).toBe(1);

    const missing = await app.request('/api/admin/users/00000000-0000-4000-8000-000000000099', {
      headers: adminAuth(),
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'user_not_found' });
  });

  it('GET /users/:id returns at most 20 newest payments', async () => {
    const now = Date.now();
    for (let i = 0; i < 25; i++) {
      await paymentStore.insertIfNotExists({
        stripeSessionId: `cs_cap_${i}`,
        userId: playerA,
        amount: 100,
        currency: 'usd',
        grantedFrom: new Date(now - i * 1000),
        grantedUntil: new Date(now + 86400000),
        status: 'paid',
        createdAt: new Date(now - i * 1000),
      });
    }
    const res = await app.request(`/api/admin/users/${playerA}`, { headers: adminAuth() });
    const body = (await res.json()) as { payments: unknown[] };
    expect(body.payments).toHaveLength(20);
  });

  it('GET /payments lists payments newest first with userId and userEmail', async () => {
    const t0 = new Date('2026-01-01T00:00:00.000Z');
    const t1 = new Date('2026-01-02T00:00:00.000Z');
    await paymentStore.insertIfNotExists({
      stripeSessionId: 'cs_old',
      userId: playerB,
      amount: 100,
      currency: 'usd',
      grantedFrom: t0,
      grantedUntil: t0,
      status: 'paid',
      createdAt: t0,
    });
    await paymentStore.insertIfNotExists({
      stripeSessionId: 'cs_new',
      userId: playerA,
      amount: 200,
      currency: 'usd',
      grantedFrom: t1,
      grantedUntil: t1,
      status: 'paid',
      createdAt: t1,
    });

    const res = await app.request('/api/admin/payments?limit=10', { headers: adminAuth() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      payments: { stripeSessionId: string; userId: string; userEmail?: string }[];
      nextCursor: string | null;
    };
    expect(body.payments[0]?.stripeSessionId).toBe('cs_new');
    expect(body.payments[0]?.userId).toBe(playerA);
    expect(body.payments[0]?.userEmail).toBe('alpha@example.com');
    expect(body.nextCursor).toBeNull();
  });

  it('POST /users/:id/revoke clears access', async () => {
    const before = await userStore.findById(playerA);
    expect(before?.accessUntil).toBeTruthy();

    const res = await app.request(`/api/admin/users/${playerA}/revoke`, {
      method: 'POST',
      headers: adminAuth(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { accessUntil: string | null };
      access: { active: boolean; accessUntil: string | null };
    };
    expect(body.user.accessUntil).toBeNull();
    expect(body.access).toEqual({ active: false, accessUntil: null });

    const unknown = await app.request('/api/admin/users/not-a-uuid/revoke', {
      method: 'POST',
      headers: adminAuth(),
    });
    expect(unknown.status).toBe(404);
  });
});
