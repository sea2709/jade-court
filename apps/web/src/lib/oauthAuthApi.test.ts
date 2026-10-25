import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAuthIdentities,
  fetchAuthProviders,
  googleSignInProviderId,
  oauthSignInStartUrl,
  unlinkOAuthProvider,
} from './oauthAuthApi';
import { PlayerAuthApiError } from './playerAuthApi';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('fetchAuthProviders', () => {
  it('returns provider ids from GET /api/auth/providers', async () => {
    fetchMock.mockResolvedValue(json({ providers: ['google'] }));
    const list = await fetchAuthProviders();
    expect(list).toEqual(['google']);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/providers',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('returns empty list when auth is disabled', async () => {
    fetchMock.mockResolvedValue(json({ error: 'auth_disabled' }, 503));
    await expect(fetchAuthProviders()).resolves.toEqual([]);
  });
});

describe('googleSignInProviderId', () => {
  it('prefers google over fake', () => {
    expect(googleSignInProviderId(['fake', 'google'])).toBe('google');
  });

  it('uses fake when google is not configured', () => {
    expect(googleSignInProviderId(['fake'])).toBe('fake');
  });
});

describe('oauthSignInStartUrl', () => {
  it('builds start URL with returnTo', () => {
    expect(oauthSignInStartUrl('google', '/account')).toBe(
      '/api/auth/google/start?returnTo=%2Faccount',
    );
  });
});

describe('fetchAuthIdentities', () => {
  it('parses hasPassword and providers', async () => {
    fetchMock.mockResolvedValue(json({ hasPassword: true, providers: ['google'] }));
    const identities = await fetchAuthIdentities();
    expect(identities).toEqual({ hasPassword: true, providers: ['google'] });
  });
});

describe('unlinkOAuthProvider', () => {
  it('throws last_sign_in_method from API', async () => {
    fetchMock.mockResolvedValue(json({ error: 'last_sign_in_method' }, 400));
    const err = unlinkOAuthProvider('google');
    await expect(err).rejects.toBeInstanceOf(PlayerAuthApiError);
    await expect(err).rejects.toMatchObject({ code: 'last_sign_in_method' });
  });
});
