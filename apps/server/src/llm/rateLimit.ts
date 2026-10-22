/** Simple per-key rate limit for LLM API routes (dev / abuse guard). */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

const buckets = new Map<string, { count: number; resetAt: number }>();

function pruneExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  pruneExpiredBuckets(now);
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, b);
  }
  b.count += 1;
  return b.count <= MAX_PER_WINDOW;
}

/** Clear all buckets (Vitest only). */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
