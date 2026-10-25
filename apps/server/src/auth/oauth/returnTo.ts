/**
 * Restrict post-OAuth redirects to same-origin relative paths.
 */

const MAX_RETURN_TO_LEN = 512;

/**
 * Allowed `returnTo` values: root-relative path only (no scheme/host).
 */
export function isAllowedReturnTo(returnTo: string): boolean {
  if (returnTo.length === 0 || returnTo.length > MAX_RETURN_TO_LEN) return false;
  if (!returnTo.startsWith('/')) return false;
  if (returnTo.startsWith('//')) return false;
  if (returnTo.includes('://')) return false;
  if (returnTo.includes('\\')) return false;
  return true;
}

export function normalizeReturnTo(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed || !isAllowedReturnTo(trimmed)) {
    return '/';
  }
  return trimmed;
}
