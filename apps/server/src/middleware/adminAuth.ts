/**
 * Bearer admin session auth with in-memory failed-attempt rate limiting.
 */
import { createHash } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isAdminEnabled } from '../admin/users.js';
import { verifySessionToken } from '../admin/session.js';
import type { AppVariables } from '../types/hono.js';

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;
const MAX_BUCKETS = 10_000;
const FALLBACK_IP_KEY = 'unknown-remote';

type Bucket = { failures: number; resetAt: number };

const failureBuckets = new Map<string, Bucket>();

/** Override bucket cap in Vitest only (`null` restores production default). */
let maxBucketsOverride: number | null = null;

function effectiveMaxBuckets(): number {
  return maxBucketsOverride ?? MAX_BUCKETS;
}

function dropExpiredBuckets(now: number): void {
  for (const [key, bucket] of failureBuckets) {
    if (now >= bucket.resetAt) failureBuckets.delete(key);
  }
}

function evictOldestBucketsUntilRoom(): void {
  const max = effectiveMaxBuckets();
  while (failureBuckets.size >= max) {
    const oldest = failureBuckets.keys().next().value;
    if (oldest === undefined) break;
    failureBuckets.delete(oldest);
  }
}

/** Before inserting a new bucket key, drop expired entries then evict oldest live keys. */
function enforceBucketCapBeforeInsert(now: number): void {
  dropExpiredBuckets(now);
  evictOldestBucketsUntilRoom();
}

/** Client IP for rate limits (conninfo; constant fallback in unit tests). */
export function remoteKey(c: Context): string {
  try {
    const info = getConnInfo(c);
    return info.remote.address ?? FALLBACK_IP_KEY;
  } catch {
    return FALLBACK_IP_KEY;
  }
}

/** Rate-limit key for login failures (IP + SHA-256 of username). */
export function adminLoginRateLimitKey(ip: string, username: string): string {
  const userHash = createHash('sha256').update(username, 'utf8').digest('hex');
  return `login:${ip}\0${userHash}`;
}

/** Rate-limit key for bad Bearer token checks (IP only). */
export function adminTokenRateLimitKey(ip: string): string {
  return `token:${ip}`;
}

/** True when the bucket is at or over the failure cap within the active window. */
export function isRateLimited(key: string, now = Date.now()): boolean {
  const bucket = failureBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) return false;
  return bucket.failures >= MAX_FAILURES;
}

/** Increment failures; returns true when the key is now rate-limited. */
export function recordFailure(key: string): boolean {
  const now = Date.now();
  let bucket = failureBuckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    const isNewKey = !failureBuckets.has(key);
    if (isNewKey) {
      enforceBucketCapBeforeInsert(now);
    }
    bucket = { failures: 0, resetAt: now + WINDOW_MS };
    failureBuckets.set(key, bucket);
  }

  bucket.failures += 1;
  return bucket.failures > MAX_FAILURES;
}

/** Clear a rate-limit bucket (successful auth). */
export function clearFailures(key: string): void {
  failureBuckets.delete(key);
}

/** Reset rate-limit buckets (Vitest only). */
export function resetAdminAuthRateLimitsForTests(): void {
  failureBuckets.clear();
  maxBucketsOverride = null;
}

/** Set max bucket count for tests (`null` = production `MAX_BUCKETS`). */
export function setMaxBucketsForTests(max: number | null): void {
  maxBucketsOverride = max;
}

/** Current bucket map size (Vitest only). */
export function failureBucketCountForTests(): number {
  return failureBuckets.size;
}

/** Bucket keys in insertion order (Vitest only). */
export function failureBucketKeysForTests(): string[] {
  return [...failureBuckets.keys()];
}

function noStore(c: Context): void {
  c.header('Cache-Control', 'no-store');
}

/** Require Authorization: Bearer with a valid admin session token. */
export const adminAuth: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  noStore(c);

  if (!isAdminEnabled()) {
    return c.json({ error: 'admin_disabled' }, 503);
  }

  const ipKey = adminTokenRateLimitKey(remoteKey(c));
  if (isRateLimited(ipKey)) {
    return c.json({ error: 'rate_limited' }, 429);
  }

  const header = c.req.header('Authorization');
  const match = header?.match(/^Bearer\s+(.+)$/i);
  const provided = match?.[1]?.trim();

  if (!provided) {
    const limited = recordFailure(ipKey);
    if (limited) {
      return c.json({ error: 'rate_limited' }, 429);
    }
    return c.json({ error: 'unauthorized' }, 401);
  }

  const result = verifySessionToken(provided);
  if (result.status === 'invalid_auth') {
    const limited = recordFailure(ipKey);
    if (limited) {
      return c.json({ error: 'rate_limited' }, 429);
    }
    return c.json({ error: 'unauthorized' }, 401);
  }

  if (result.status === 'unauthorized') {
    return c.json({ error: 'unauthorized' }, 401);
  }

  clearFailures(ipKey);
  c.set('adminUser', result.username);
  await next();
};
