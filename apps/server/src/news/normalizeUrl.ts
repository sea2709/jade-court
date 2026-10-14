/**
 * Normalize outbound news URLs for duplicate detection (host, tracking params, fragment).
 */

export type NormalizeUrlResult =
  { ok: true; normalized: string; sourceDomain: string } | { ok: false; error: 'invalid_url' };

const TRACKING_PARAM_PREFIXES = ['utm_'];
const TRACKING_PARAMS = new Set(['fbclid']);

/**
 * Normalize a URL for storage and duplicate checks.
 * Lowercases host, strips tracking query params and fragments, trims default ports.
 */
export function normalizeNewsUrl(input: string): NormalizeUrlResult {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, error: 'invalid_url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'invalid_url' };
  }

  url.hostname = url.hostname.toLowerCase();

  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = '';
  }

  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower)) continue;
    if (TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p))) continue;
    kept.append(key, value);
  }
  url.search = kept.toString() ? `?${kept.toString()}` : '';

  url.hash = '';

  let path = url.pathname;
  if (path.endsWith('/') && path.length > 1) {
    path = path.replace(/\/+$/, '');
    url.pathname = path;
  } else if (path === '') {
    url.pathname = '/';
  }

  let normalized = url.toString();
  if (url.pathname === '/' && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  const sourceDomain = url.hostname;
  return { ok: true, normalized, sourceDomain };
}

/** Validate http(s) without full normalization (for image URLs). */
export function isHttpsUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Validate http(s) source URLs. */
export function isHttpOrHttpsUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
