/**
 * URL-driven sign-in vs register mode on `/login`.
 */

export type AuthScreenMode = 'signin' | 'register';

export const AUTH_REGISTER_MODE = 'register';

/** Read auth mode from `?mode=` (default sign-in). */
export function authModeFromSearch(search: string): AuthScreenMode {
  const mode = new URLSearchParams(search).get('mode');
  return mode === AUTH_REGISTER_MODE ? 'register' : 'signin';
}

/**
 * Build query string for `/login` when switching mode, preserving `next`, `oauth_error`, etc.
 */
export function authLoginSearch(current: URLSearchParams, mode: AuthScreenMode): string {
  const next = new URLSearchParams(current);
  if (mode === 'register') {
    next.set('mode', AUTH_REGISTER_MODE);
  } else {
    next.delete('mode');
  }
  const serialized = next.toString();
  return serialized ? `?${serialized}` : '';
}
