/**
 * OIDC ID token verification (injectable JWKS for tests).
 */
import * as jose from 'jose';
import type { OAuthProfile } from './types.js';

export type IdTokenClaims = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

export type VerifyIdTokenOptions = {
  idToken: string;
  audience: string;
  issuer: string | string[];
  /** When set, used instead of Google's live JWKS (unit tests). */
  jwks?: jose.JWTVerifyGetKey;
};

function profileFromClaims(claims: IdTokenClaims): OAuthProfile {
  const email =
    typeof claims.email === 'string' && claims.email.length > 0
      ? claims.email.trim().toLowerCase()
      : undefined;
  return {
    sub: claims.sub,
    ...(email ? { email } : {}),
    emailVerified: claims.email_verified === true,
    ...(typeof claims.name === 'string' && claims.name.trim().length > 0
      ? { name: claims.name.trim() }
      : {}),
  };
}

let googleJwks: jose.JWTVerifyGetKey | null = null;

function googleJwksRemote(): jose.JWTVerifyGetKey {
  if (!googleJwks) {
    googleJwks = jose.createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  }
  return googleJwks;
}

/** Reset cached Google JWKS (tests). */
export function resetGoogleJwksForTests(): void {
  googleJwks = null;
}

/** Verify signature, `aud`, `iss`, and `exp`; return normalized profile. */
export async function verifyIdToken(options: VerifyIdTokenOptions): Promise<OAuthProfile> {
  const key = options.jwks ?? googleJwksRemote();
  const { payload } = await jose.jwtVerify(options.idToken, key, {
    audience: options.audience,
    issuer: options.issuer,
  });
  const sub = payload.sub;
  if (!sub || typeof sub !== 'string') {
    throw new Error('invalid_id_token');
  }
  return profileFromClaims({
    sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    email_verified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : undefined,
  });
}
