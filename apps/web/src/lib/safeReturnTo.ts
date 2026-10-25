/**
 * Sanitize post-auth redirect paths (OAuth `returnTo` and login `next`).
 */
export function safeReturnTo(raw: string | null, fallback = '/'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}

/** Default landing after sign-in when `next` is missing or points at auth screens. */
export function safeLoginNextPath(raw: string | null): string {
  const path = safeReturnTo(raw, '/play');
  if (path === '/login' || path.startsWith('/login?')) return '/play';
  if (path === '/register' || path.startsWith('/register?')) return '/play';
  return path;
}
