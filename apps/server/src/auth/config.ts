/**
 * Player session configuration from environment.
 */

/** httpOnly session cookie name. */
export const SESSION_COOKIE_NAME = 'jade_session';

const DEFAULT_TTL_HOURS = 720; // 30 days

/** HMAC/pepper secret for hashing session tokens at rest. */
export function sessionSecret(): string {
  return process.env.SESSION_SECRET?.trim() ?? '';
}

/** Session lifetime in milliseconds. */
export function sessionTtlMs(): number {
  const raw = process.env.SESSION_TTL_HOURS?.trim();
  if (!raw) return DEFAULT_TTL_HOURS * 60 * 60 * 1000;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) {
    return DEFAULT_TTL_HOURS * 60 * 60 * 1000;
  }
  return hours * 60 * 60 * 1000;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

const MIN_SECRET_LEN = 32;

function isRelaxedPlayerAuthEnv(): boolean {
  const env = process.env.NODE_ENV?.trim();
  return env === 'development' || env === 'test';
}

/**
 * When false, register/login refuse to mint sessions and middleware ignores cookies.
 * Relaxed only for `NODE_ENV=development|test`; all other envs require a 32+ char secret.
 */
export function isPlayerAuthEnabled(): boolean {
  if (isRelaxedPlayerAuthEnv()) {
    return true;
  }
  return sessionSecret().length >= MIN_SECRET_LEN;
}
