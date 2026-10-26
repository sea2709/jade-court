/**
 * Test-only OAuth provider — start redirects straight to callback with a fixed identity.
 */
import { appBaseUrl, isFakeOAuthEnabled } from './config.js';
import type { OAuthProfile, OAuthProvider } from './types.js';

export const FAKE_OAUTH_CODE = 'fake-oauth-code';
export const FAKE_OAUTH_SUB = 'fake-user-sub';
export const FAKE_OAUTH_EMAIL = 'fake-oauth@example.com';

export function createFakeOAuthProvider(): OAuthProvider {
  return {
    id: 'fake',
    isConfigured() {
      return isFakeOAuthEnabled();
    },
    authorizeUrl(state: string, _codeChallenge: string) {
      const redirectUri = `${appBaseUrl()}/api/auth/fake/callback`;
      const params = new URLSearchParams({
        code: FAKE_OAUTH_CODE,
        state,
      });
      return `${redirectUri}?${params.toString()}`;
    },
    async exchange(code: string, _codeVerifier: string): Promise<OAuthProfile> {
      if (code !== FAKE_OAUTH_CODE) {
        throw new Error('invalid_code');
      }
      return {
        sub: FAKE_OAUTH_SUB,
        email: FAKE_OAUTH_EMAIL,
        emailVerified: true,
        name: 'Fake OAuth User',
      };
    },
  };
}
