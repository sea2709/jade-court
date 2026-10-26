/**
 * Facebook Login OAuth provider (authorization code + Graph `/me`).
 */
import { fetch } from 'undici';
import { facebookAppSecretProof } from './appSecretProof.js';
import {
  appBaseUrl,
  facebookAppId,
  facebookAppSecret,
  isFacebookOAuthConfigured,
} from './config.js';
import type { OAuthProfile, OAuthProvider } from './types.js';

const FB_DIALOG = 'https://www.facebook.com/v21.0/dialog/oauth';
const FB_GRAPH = 'https://graph.facebook.com/v21.0';

export type FacebookOAuthDeps = {
  /** Override HTTP for Vitest. */
  fetchImpl?: typeof fetch;
};

export function createFacebookOAuthProvider(deps: FacebookOAuthDeps = {}): OAuthProvider {
  const fetchImpl = deps.fetchImpl ?? fetch;

  return {
    id: 'facebook',
    isConfigured() {
      return isFacebookOAuthConfigured();
    },
    authorizeUrl(state: string, _codeChallenge: string) {
      const clientId = facebookAppId();
      const redirectUri = `${appBaseUrl()}/api/auth/facebook/callback`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        scope: 'email,public_profile',
        response_type: 'code',
      });
      return `${FB_DIALOG}?${params.toString()}`;
    },
    async exchange(code: string, _codeVerifier: string): Promise<OAuthProfile> {
      const clientId = facebookAppId();
      const clientSecret = facebookAppSecret();
      const redirectUri = `${appBaseUrl()}/api/auth/facebook/callback`;
      const tokenParams = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      });
      const tokenRes = await fetchImpl(`${FB_GRAPH}/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });
      if (!tokenRes.ok) {
        throw new Error('token_exchange_failed');
      }
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      const accessToken = tokenJson.access_token;
      if (!accessToken || typeof accessToken !== 'string') {
        throw new Error('missing_access_token');
      }

      const proof = facebookAppSecretProof(accessToken, clientSecret);
      const meParams = new URLSearchParams({
        fields: 'id,name,email',
        access_token: accessToken,
        appsecret_proof: proof,
      });
      const meRes = await fetchImpl(`${FB_GRAPH}/me?${meParams.toString()}`);
      if (!meRes.ok) {
        throw new Error('profile_fetch_failed');
      }
      const me = (await meRes.json()) as { id?: string; name?: string; email?: string };
      if (!me.id || typeof me.id !== 'string') {
        throw new Error('missing_user_id');
      }
      const email =
        typeof me.email === 'string' && me.email.trim().length > 0 ? me.email.trim() : undefined;
      return {
        sub: me.id,
        email,
        emailVerified: false,
        ...(typeof me.name === 'string' && me.name.trim() ? { name: me.name.trim() } : {}),
      };
    },
  };
}
