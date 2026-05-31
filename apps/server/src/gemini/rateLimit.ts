/** Simple per-guest rate limit for Gemma API routes (dev / abuse guard). */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(guestId: string): boolean {
  const now = Date.now();
  let b = buckets.get(guestId);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(guestId, b);
  }
  b.count += 1;
  return b.count <= MAX_PER_WINDOW;
}
