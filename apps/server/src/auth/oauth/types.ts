/**
 * Shared OAuth provider contract and normalized profile from IdP token exchange.
 */

/** Normalized identity from an OAuth/OIDC `exchange` step. */
export type OAuthProfile = {
  sub: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
};

/** Pluggable OAuth provider (Google, test fake, future Facebook). */
export interface OAuthProvider {
  readonly id: string;
  /** Whether env/config allows using this provider. */
  isConfigured(): boolean;
  /** Build the provider authorize URL (PKCE S256 challenge + state). */
  authorizeUrl(state: string, codeChallenge: string): string;
  /** Trade authorization code for a verified profile. */
  exchange(code: string, codeVerifier: string): Promise<OAuthProfile>;
}
