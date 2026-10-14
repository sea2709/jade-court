/**
 * Bearer ADMIN_TOKEN auth for news curation routes, with in-memory failed-attempt rate limiting.
 */
import { timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;
const FALLBACK_IP_KEY = 'unknown-remote';

type Bucket = { failures: number; resetAt: number };

const failureBuckets = new Map<string, Bucket>();

function remoteKey(c: Context): string {
  try {
    const info = getConnInfo(c);
    return info.remote.address ?? FALLBACK_IP_KEY;
  } catch {
    return FALLBACK_IP_KEY;
  }
}

function safeTokenEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function recordFailure(key: string): boolean {
  const now = Date.now();
  let bucket = failureBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { failures: 0, resetAt: now + WINDOW_MS };
    failureBuckets.set(key, bucket);
  }
  bucket.failures += 1;
  return bucket.failures > MAX_FAILURES;
}

function clearFailures(key: string): void {
  failureBuckets.delete(key);
}

/** Reset rate-limit buckets (Vitest only). */
export function resetAdminAuthRateLimitsForTests(): void {
  failureBuckets.clear();
}

/** Require Authorization: Bearer matching ADMIN_TOKEN. */
export const adminAuth: MiddlewareHandler = async (c, next) => {
  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) {
    return c.json({ error: 'admin_disabled' }, 503);
  }

  const key = remoteKey(c);
  const bucket = failureBuckets.get(key);
  if (bucket && Date.now() < bucket.resetAt && bucket.failures >= MAX_FAILURES) {
    return c.json({ error: 'rate_limited' }, 429);
  }

  const header = c.req.header('Authorization');
  const match = header?.match(/^Bearer\s+(.+)$/i);
  const provided = match?.[1]?.trim();

  if (!provided || !safeTokenEqual(provided, token)) {
    const limited = recordFailure(key);
    if (limited) {
      return c.json({ error: 'rate_limited' }, 429);
    }
    return c.json({ error: 'unauthorized' }, 401);
  }

  clearFailures(key);
  await next();
};
