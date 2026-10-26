/**
 * OAuth environment (Google, app base URL, test fake provider).
 */
import { isTestEnv } from '../../email/config.js';

/** Public web origin for OAuth redirects and same-origin `returnTo` checks. */
export function appBaseUrl(): string {
  const raw =
    process.env.APP_BASE_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    'http://localhost:5173';
  return raw.replace(/\/+$/, '');
}

export function googleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID?.trim() ?? '';
}

export function googleClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
}

export function isGoogleOAuthConfigured(): boolean {
  return googleClientId().length > 0 && googleClientSecret().length > 0;
}

function isFakeOAuthFlagSet(): boolean {
  const flag = process.env.OAUTH_FAKE_ENABLED?.trim();
  return flag === '1' || flag === 'true';
}

/**
 * Fake OAuth provider — never in production.
 * Enabled when `NODE_ENV=test`, or `NODE_ENV=development` with `OAUTH_FAKE_ENABLED=1|true`.
 */
export function isFakeOAuthEnabled(): boolean {
  const nodeEnv = process.env.NODE_ENV?.trim();
  if (nodeEnv === 'production') {
    return false;
  }
  if (isTestEnv()) {
    return true;
  }
  if (nodeEnv === 'development' && isFakeOAuthFlagSet()) {
    return true;
  }
  return false;
}
