import { afterEach, describe, expect, it, vi } from 'vitest';
import { facebookAppSecretProof } from './appSecretProof.js';
import { createFacebookOAuthProvider } from './facebook.js';

const envSnapshot = { ...process.env };

describe('facebook OAuth provider', () => {
  afterEach(() => {
    process.env = { ...envSnapshot };
    vi.restoreAllMocks();
  });

  it('computes appsecret_proof as HMAC-SHA256 hex of access token', () => {
    const proof = facebookAppSecretProof('test-access-token', 'my-secret');
    expect(proof).toMatch(/^[a-f0-9]{64}$/);
    expect(proof).toBe(facebookAppSecretProof('test-access-token', 'my-secret'));
    expect(proof).not.toBe(facebookAppSecretProof('other-token', 'my-secret'));
  });

  it('exchanges code and fetches /me with appsecret_proof', async () => {
    process.env.FACEBOOK_APP_ID = 'fb-app-id';
    process.env.FACEBOOK_APP_SECRET = 'fb-app-secret';
    process.env.PUBLIC_APP_URL = 'http://localhost:5173';

    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes('/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'at-123' }), { status: 200 });
      }
      if (href.includes('/me?')) {
        const u = new URL(href);
        expect(u.searchParams.get('fields')).toBe('id,name,email');
        expect(u.searchParams.get('access_token')).toBe('at-123');
        const proof = u.searchParams.get('appsecret_proof');
        expect(proof).toBe(facebookAppSecretProof('at-123', 'fb-app-secret'));
        return new Response(
          JSON.stringify({ id: 'fb-user-1', name: 'FB User', email: 'fb@example.com' }),
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    });

    const provider = createFacebookOAuthProvider({ fetchImpl: fetchImpl as typeof fetch });
    const profile = await provider.exchange('auth-code', 'verifier-xyz');
    expect(profile).toEqual({
      sub: 'fb-user-1',
      email: 'fb@example.com',
      emailVerified: false,
      name: 'FB User',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const tokenCall = fetchImpl.mock.calls[0];
    expect(String(tokenCall[0])).toContain('/oauth/access_token');
    expect(tokenCall[1]).toMatchObject({ method: 'POST' });
  });

  it('omits email when Graph does not return one', async () => {
    process.env.FACEBOOK_APP_ID = 'fb-app-id';
    process.env.FACEBOOK_APP_SECRET = 'fb-app-secret';
    process.env.PUBLIC_APP_URL = 'http://localhost:5173';

    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes('/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'at-no-email' }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'fb-no-email', name: 'No Email' }), { status: 200 });
    });

    const provider = createFacebookOAuthProvider({ fetchImpl: fetchImpl as typeof fetch });
    const profile = await provider.exchange('code', 'verifier');
    expect(profile.sub).toBe('fb-no-email');
    expect(profile.email).toBeUndefined();
    expect(profile.emailVerified).toBe(false);
  });
});
