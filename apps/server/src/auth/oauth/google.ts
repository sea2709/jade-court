/**
 * Google OpenID Connect OAuth provider.
 */
import { fetch } from 'undici';
import {
  appBaseUrl,
  googleClientId,
  googleClientSecret,
  isGoogleOAuthConfigured,
} from './config.js';
import type { OAuthProfile, OAuthProvider } from './types.js';
import { verifyIdToken } from './verifyIdToken.js';
import type * as jose from 'jose';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export type GoogleOAuthDeps = {
  /** Test injection for ID token verification. */
  jwks?: jose.JWTVerifyGetKey;
  /** Override token HTTP (tests). */
  fetchToken?: typeof fetch;
};

export function createGoogleOAuthProvider(deps: GoogleOAuthDeps = {}): OAuthProvider {
  const fetchToken = deps.fetchToken ?? fetch;

  return {
    id: 'google',
    isConfigured() {
      return isGoogleOAuthConfigured();
    },
    authorizeUrl(state: string, codeChallenge: string) {
      const clientId = googleClientId();
      const redirectUri = `${appBaseUrl()}/api/auth/google/callback`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        access_type: 'online',
        prompt: 'select_account',
      });
      return `${GOOGLE_AUTH}?${params.toString()}`;
    },
    async exchange(code: string, codeVerifier: string): Promise<OAuthProfile> {
      const clientId = googleClientId();
      const clientSecret = googleClientSecret();
      const redirectUri = `${appBaseUrl()}/api/auth/google/callback`;
      const body = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      });
      const res = await fetchToken(GOOGLE_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) {
        throw new Error('token_exchange_failed');
      }
      const json = (await res.json()) as { id_token?: string };
      const idToken = json.id_token;
      if (!idToken || typeof idToken !== 'string') {
        throw new Error('missing_id_token');
      }
      return verifyIdToken({
        idToken,
        audience: clientId,
        issuer: GOOGLE_ISSUERS,
        ...(deps.jwks ? { jwks: deps.jwks } : {}),
      });
    },
  };
}
