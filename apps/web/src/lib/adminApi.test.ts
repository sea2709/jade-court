import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_SESSION_STORAGE_KEY,
  AdminApiError,
  adminAuthHeader,
  adminLogin,
  clearAdminSession,
  fetchAdminMe,
  getAdminSession,
  isValidAdminNext,
  resolveAdminNextParam,
  safeAdminNext,
  setAdminSession,
} from './adminApi';

const fetchMock = vi.fn<typeof fetch>();

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

const futureExpiry = () => new Date(Date.now() + 60_000).toISOString();

describe('getAdminSession', () => {
  it('returns null when storage is empty', () => {
    expect(getAdminSession()).toBeNull();
  });

  it('clears and returns null for malformed JSON', () => {
    sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, '{not-json');
    expect(getAdminSession()).toBeNull();
    expect(sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('clears and returns null for wrong shape', () => {
    sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify({ token: 'x' }));
    expect(getAdminSession()).toBeNull();
  });

  it('clears expired sessions', () => {
    setAdminSession({
      token: 't',
      username: 'alice',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(getAdminSession()).toBeNull();
  });

  it('returns a valid session', () => {
    const session = { token: 't', username: 'alice', expiresAt: futureExpiry() };
    setAdminSession(session);
    expect(getAdminSession()).toEqual(session);
  });
});

describe('adminAuthHeader', () => {
  it('includes Bearer when session exists', () => {
    setAdminSession({ token: 'secret', username: 'a', expiresAt: futureExpiry() });
    expect(adminAuthHeader()).toEqual({ Authorization: 'Bearer secret' });
  });

  it('returns empty object without session', () => {
    expect(adminAuthHeader()).toEqual({});
  });
});

describe('safeAdminNext', () => {
  const rejectCases = [
    '/admin/../login',
    '/admin/%2e%2e/login',
    '/admin/./../x',
    '/administrator',
    '/admin@evil.com',
    '//evil.com',
    '/\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '/admin/login',
    '/admin/login/',
    null,
    undefined,
    '',
  ] as const;

  it.each(rejectCases.map((c) => [String(c), c] as const))('rejects %s → /admin', (_label, raw) => {
    expect(safeAdminNext(raw)).toBe('/admin');
    if (typeof raw === 'string' && raw.length > 0) {
      expect(isValidAdminNext(raw)).toBe(false);
    }
  });

  it('accepts /admin', () => {
    expect(safeAdminNext('/admin')).toBe('/admin');
    expect(isValidAdminNext('/admin')).toBe(true);
  });

  it('accepts /admin/news', () => {
    expect(safeAdminNext('/admin/news')).toBe('/admin/news');
  });

  it('preserves query and hash on /admin/news', () => {
    expect(safeAdminNext('/admin/news?q=a#h')).toBe('/admin/news?q=a#h');
  });

  it('normalizes /admin//news to /admin/news', () => {
    expect(safeAdminNext('/admin//news')).toBe('/admin/news');
  });

  it('round-trips layout-style next values', () => {
    expect(safeAdminNext('/admin/news?x=1')).toBe('/admin/news?x=1');
  });
});

describe('resolveAdminNextParam', () => {
  it('defaults to /admin for unsafe values', () => {
    expect(resolveAdminNextParam(null)).toBe('/admin');
    expect(resolveAdminNextParam('/admin/../login')).toBe('/admin');
  });

  it('keeps valid normalized next', () => {
    expect(resolveAdminNextParam('/admin/news')).toBe('/admin/news');
  });
});

describe('adminLogin', () => {
  it('stores session on success', async () => {
    const body = { token: 'tok', username: 'alice', expiresAt: futureExpiry() };
    fetchMock.mockResolvedValue(json(body));
    const session = await adminLogin('alice', 'pass');
    expect(session).toEqual(body);
    expect(getAdminSession()).toEqual(body);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/login');
  });

  it('throws AdminApiError on invalid credentials', async () => {
    fetchMock.mockResolvedValue(json({ error: 'invalid_credentials' }, 401));
    await expect(adminLogin('x', 'y')).rejects.toMatchObject({
      code: 'invalid_credentials',
      status: 401,
    });
  });
});

describe('fetchAdminMe', () => {
  it('clears session on 401', async () => {
    setAdminSession({ token: 'bad', username: 'a', expiresAt: futureExpiry() });
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    await expect(fetchAdminMe()).rejects.toBeInstanceOf(AdminApiError);
    expect(getAdminSession()).toBeNull();
  });

  it('returns username on success', async () => {
    setAdminSession({ token: 'ok', username: 'a', expiresAt: futureExpiry() });
    fetchMock.mockResolvedValue(json({ username: 'alice' }));
    await expect(fetchAdminMe()).resolves.toEqual({ username: 'alice' });
  });
});

describe('clearAdminSession', () => {
  it('removes stored session', () => {
    setAdminSession({ token: 'x', username: 'a', expiresAt: futureExpiry() });
    clearAdminSession();
    expect(sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY)).toBeNull();
  });
});
