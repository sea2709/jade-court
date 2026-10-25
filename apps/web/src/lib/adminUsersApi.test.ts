import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_SESSION_STORAGE_KEY, setAdminSession } from './adminApi';
import {
  AdminUsersApiError,
  fetchAdminPayments,
  fetchAdminUserDetail,
  grantAdminUserAccess,
  revokeAdminUserAccess,
  searchAdminUsers,
} from './adminUsersApi';

const fetchMock = vi.fn<typeof fetch>();

const futureExpiry = () => new Date(Date.now() + 60_000).toISOString();

function storeAdminToken(token: string) {
  setAdminSession({ token, username: 'admin', expiresAt: futureExpiry() });
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('searchAdminUsers', () => {
  it('GETs /api/admin/users with q and bearer token', async () => {
    storeAdminToken('secret');
    fetchMock.mockResolvedValue(json({ users: [], nextCursor: null }));
    await searchAdminUsers({ q: 'player@example.com' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/users?q=player%40example.com');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret' });
  });

  it('clears session on 401', async () => {
    storeAdminToken('bad');
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    await expect(searchAdminUsers({ q: 'x' })).rejects.toBeInstanceOf(AdminUsersApiError);
    expect(sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY)).toBeNull();
  });
});

describe('fetchAdminUserDetail', () => {
  it('GETs user detail by id', async () => {
    storeAdminToken('t');
    const payload = {
      user: {
        id: 'u1',
        email: 'a@b.c',
        emailVerified: true,
        displayName: null,
        accessUntil: null,
        preferredModelId: null,
      },
      identities: [],
      access: { active: false, accessUntil: null },
      payments: [],
    };
    fetchMock.mockResolvedValue(json(payload));
    const res = await fetchAdminUserDetail('u1');
    expect(res.user.id).toBe('u1');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/users/u1');
  });
});

describe('grant and revoke', () => {
  it('POSTs grant with hours body', async () => {
    storeAdminToken('t');
    fetchMock.mockResolvedValue(
      json({
        user: {
          id: 'u1',
          email: null,
          emailVerified: false,
          displayName: null,
          accessUntil: '2026-01-01T00:00:00.000Z',
          preferredModelId: null,
        },
        access: { active: true, accessUntil: '2026-01-01T00:00:00.000Z' },
      }),
    );
    await grantAdminUserAccess('u1', 24);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ hours: 24 }));
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/grant');
  });

  it('POSTs revoke without body', async () => {
    storeAdminToken('t');
    fetchMock.mockResolvedValue(
      json({
        user: {
          id: 'u1',
          email: null,
          emailVerified: false,
          displayName: null,
          accessUntil: null,
          preferredModelId: null,
        },
        access: { active: false, accessUntil: null },
      }),
    );
    await revokeAdminUserAccess('u1');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/revoke');
  });
});

describe('fetchAdminPayments', () => {
  it('GETs /api/admin/payments', async () => {
    storeAdminToken('t');
    fetchMock.mockResolvedValue(json({ payments: [], nextCursor: null }));
    await fetchAdminPayments();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/payments');
  });
});
