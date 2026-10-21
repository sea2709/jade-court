/**
 * Player auth rate limits (login failures, failed-login volume, register attempts).
 * Failed-login volume bounds rotating-email scrypt abuse; successful logins roll back
 * the pending slot so another account on the same proxy peer can still sign in.
 */
import { createHash } from 'node:crypto';

const WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILURES = 10;
const REGISTER_MAX_GLOBAL = 60;
/** Process-wide cap on failed login verifications (scrypt) per window. */
const LOGIN_FAILED_VOLUME_MAX_GLOBAL = 300;
const MAX_BUCKETS = 10_000;

type Bucket = { attempts: number; resetAt: number };

const loginFailureBuckets = new Map<string, Bucket>();
let loginFailedVolumeGlobalBucket: Bucket | null = null;
let registerGlobalBucket: Bucket | null = null;

let maxBucketsOverride: number | null = null;
let registerMaxGlobalOverride: number | null = null;
let loginFailedVolumeMaxGlobalOverride: number | null = null;

function effectiveMaxBuckets(): number {
  return maxBucketsOverride ?? MAX_BUCKETS;
}

function effectiveRegisterMaxGlobal(): number {
  return registerMaxGlobalOverride ?? REGISTER_MAX_GLOBAL;
}

function effectiveLoginFailedVolumeMaxGlobal(): number {
  return loginFailedVolumeMaxGlobalOverride ?? LOGIN_FAILED_VOLUME_MAX_GLOBAL;
}

function dropExpiredBuckets(map: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of map) {
    if (now >= bucket.resetAt) map.delete(key);
  }
}

function evictOldestBucketsUntilRoom(map: Map<string, Bucket>): void {
  const max = effectiveMaxBuckets();
  while (map.size >= max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function getOrCreateBucket(map: Map<string, Bucket>, key: string, now: number): Bucket {
  let bucket = map.get(key);
  if (!bucket || now >= bucket.resetAt) {
    const isNewKey = !map.has(key);
    if (isNewKey) {
      dropExpiredBuckets(map, now);
      evictOldestBucketsUntilRoom(map);
    }
    bucket = { attempts: 0, resetAt: now + WINDOW_MS };
    map.set(key, bucket);
  }
  return bucket;
}

/** Per-email failed-login cap (does not block other emails on a shared proxy peer). */
export function playerLoginEmailKey(email: string): string {
  const normalized = email.trim().toLowerCase();
  const emailHash = createHash('sha256').update(normalized, 'utf8').digest('hex');
  return `player:email:${emailHash}`;
}

/** Per peer + email failed-login cap (admin-style; not shared across emails). */
export function playerLoginPeerEmailKey(ip: string, email: string): string {
  const normalized = email.trim().toLowerCase();
  const emailHash = createHash('sha256').update(normalized, 'utf8').digest('hex');
  return `player:login:${ip}\0${emailHash}`;
}

export type ReserveResult = 'ok' | 'limited';

function reserveInMap(
  map: Map<string, Bucket>,
  key: string,
  max: number,
  now: number,
): ReserveResult {
  const bucket = getOrCreateBucket(map, key, now);
  if (bucket.attempts >= max) {
    return 'limited';
  }
  bucket.attempts += 1;
  return 'ok';
}

function rollbackInMap(map: Map<string, Bucket>, key: string): void {
  const bucket = map.get(key);
  if (bucket && bucket.attempts > 0) {
    bucket.attempts -= 1;
  }
}

function getOrCreateGlobalBucket(
  current: Bucket | null,
  reset: (b: Bucket | null) => void,
  now: number,
): Bucket {
  if (!current || now >= current.resetAt) {
    current = { attempts: 0, resetAt: now + WINDOW_MS };
    reset(current);
  }
  return current;
}

/**
 * Reserve one failed-login slot across all keys (all must have capacity).
 * Call synchronously before any `await` that runs scrypt or loads the user.
 */
export function reserveLoginFailureAttempts(keys: string[], now = Date.now()): ReserveResult {
  const reserved: { map: Map<string, Bucket>; key: string }[] = [];
  for (const key of keys) {
    const result = reserveInMap(loginFailureBuckets, key, LOGIN_MAX_FAILURES, now);
    if (result === 'limited') {
      for (const r of reserved) {
        rollbackInMap(r.map, r.key);
      }
      return 'limited';
    }
    reserved.push({ map: loginFailureBuckets, key });
  }
  return 'ok';
}

/** @deprecated alias */
export const reserveLoginAttempts = reserveLoginFailureAttempts;

function failedLoginVolumeCount(now = Date.now()): number {
  const bucket = loginFailedVolumeGlobalBucket;
  if (!bucket || now >= bucket.resetAt) return 0;
  return bucket.attempts;
}

function reserveFailedLoginVolume(now = Date.now()): ReserveResult {
  const max = effectiveLoginFailedVolumeMaxGlobal();
  const global = getOrCreateGlobalBucket(
    loginFailedVolumeGlobalBucket,
    (b) => {
      loginFailedVolumeGlobalBucket = b;
    },
    now,
  );
  if (global.attempts >= max) {
    return 'limited';
  }
  global.attempts += 1;
  return 'ok';
}

function rollbackFailedLoginVolume(): void {
  if (!loginFailedVolumeGlobalBucket) return;
  if (loginFailedVolumeGlobalBucket.attempts > 0) {
    loginFailedVolumeGlobalBucket.attempts -= 1;
  }
}

export type LoginPasswordCheckVolume =
  { kind: 'below_cap'; rollback: () => void } | { kind: 'at_cap' };

/**
 * Begin a login password check (before scrypt). Below the failed-login volume cap, reserves
 * a slot synchronously (rollback on success). At cap, still allows scrypt so a correct password
 * for another email can succeed; failed attempts are recorded after scrypt.
 */
export function beginLoginPasswordCheck(now = Date.now()): LoginPasswordCheckVolume | 'limited' {
  const max = effectiveLoginFailedVolumeMaxGlobal();
  if (failedLoginVolumeCount(now) >= max) {
    return { kind: 'at_cap' };
  }
  if (reserveFailedLoginVolume(now) === 'limited') {
    return 'limited';
  }
  return { kind: 'below_cap', rollback: rollbackFailedLoginVolume };
}

/** Record a failed login when the volume cap was already reached (after scrypt). */
export function recordFailedLoginAtVolumeCap(now = Date.now()): ReserveResult {
  return reserveFailedLoginVolume(now);
}

export function clearLoginFailureAttempts(...keys: string[]): void {
  for (const key of keys) {
    loginFailureBuckets.delete(key);
  }
}

/** @deprecated alias */
export const clearLoginAttempts = clearLoginFailureAttempts;

/** Reserve process-wide register budget before `hashPassword` (no per-proxy-peer cap). */
export function reserveRegisterAttempt(now = Date.now()): ReserveResult {
  const globalMax = effectiveRegisterMaxGlobal();
  const global = getOrCreateGlobalBucket(
    registerGlobalBucket,
    (b) => {
      registerGlobalBucket = b;
    },
    now,
  );
  if (global.attempts >= globalMax) {
    return 'limited';
  }
  global.attempts += 1;
  return 'ok';
}

/** Set register global cap for Vitest only (`null` restores default). */
export function setRegisterGlobalMaxForTests(max: number | null): void {
  registerMaxGlobalOverride = max;
}

/** Set failed-login global volume cap for Vitest only (`null` restores default). */
export function setLoginFailedVolumeMaxForTests(max: number | null): void {
  loginFailedVolumeMaxGlobalOverride = max;
}

/** @deprecated use setLoginFailedVolumeMaxForTests */
export function setLoginVolumeLimitsForTests(_peer: number | null, global: number | null): void {
  setLoginFailedVolumeMaxForTests(global);
}

/** Reset buckets (Vitest only). */
export function resetPlayerAuthRateLimitsForTests(): void {
  loginFailureBuckets.clear();
  loginFailedVolumeGlobalBucket = null;
  registerGlobalBucket = null;
  maxBucketsOverride = null;
  registerMaxGlobalOverride = null;
  loginFailedVolumeMaxGlobalOverride = null;
}
