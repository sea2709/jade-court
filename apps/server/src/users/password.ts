/**
 * Password hashing with Node crypto.scrypt (salt stored alongside hash).
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;

/** Used on unknown-user login so scrypt always runs (timing-safe). */
export const PLAYER_DUMMY_PASSWORD_FOR_TIMING = 'jade-court-player-dummy-password-for-timing';

let cachedDummyHash: string | null = null;

async function dummyPasswordHash(): Promise<string> {
  if (!cachedDummyHash) {
    cachedDummyHash = await hashPassword(PLAYER_DUMMY_PASSWORD_FOR_TIMING);
  }
  return cachedDummyHash;
}

/** Reset cached dummy hash (Vitest only). */
export function resetDummyPasswordHashForTests(): void {
  cachedDummyHash = null;
}

/** Hash a plaintext password for storage. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

/** Constant-time compare against a stored `hashPassword` value. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const colon = stored.indexOf(':');
  if (colon <= 0) return false;
  const salt = stored.slice(0, colon);
  const hashHex = stored.slice(colon + 1);
  if (!salt || !hashHex) return false;
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(hashHex, 'hex');
    actual = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Verify a login password. Unknown users still run scrypt against a fixed dummy hash.
 */
export async function verifyLoginPassword(
  password: string,
  storedHash: string | undefined,
): Promise<boolean> {
  const hash = storedHash ?? (await dummyPasswordHash());
  const matches = await verifyPassword(password, hash);
  if (!storedHash) {
    return false;
  }
  return matches;
}
