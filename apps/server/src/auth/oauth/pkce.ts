/**
 * PKCE helpers for OAuth authorization code flow.
 */
import { createHash, randomBytes } from 'node:crypto';

/** RFC 7636 code verifier (43–128 chars). */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/** S256 code challenge from verifier. */
export function codeChallengeS256(verifier: string): string {
  return createHash('sha256').update(verifier, 'utf8').digest('base64url');
}
