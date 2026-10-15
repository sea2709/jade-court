/**
 * Admin account list from `ADMIN_USERS` (plaintext passwords, constant-time verify).
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/** Used only on the unknown-user branch so work matches the known-user path; never a valid login. */
const DUMMY_PASSWORD = 'jade-court-admin-dummy-password-for-timing';

/** Exposed for regression tests (dummy password must not authenticate unknown users). */
export const ADMIN_DUMMY_PASSWORD_FOR_TIMING = DUMMY_PASSWORD;

/**
 * Parse `ADMIN_USERS` (`user:pass,user2:pass2`) into a map. Passwords may contain `:`.
 * Malformed entries (no `:`, empty user/password) are skipped.
 */
export function parseAdminUsers(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  const trimmed = raw.trim();
  if (!trimmed) return map;

  for (const entry of trimmed.split(',')) {
    const piece = entry.trim();
    if (!piece) continue;
    const colon = piece.indexOf(':');
    if (colon <= 0) continue;
    const username = piece.slice(0, colon).trim();
    const password = piece.slice(colon + 1).trim();
    if (!username || !password) continue;
    map.set(username, password);
  }
  return map;
}

function passwordDigest(password: string): Buffer {
  return createHash('sha256').update(password, 'utf8').digest();
}

/** Compare passwords via fixed-width SHA-256 digests (no length short-circuit). */
function passwordsMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(passwordDigest(provided), passwordDigest(expected));
}

/**
 * Verify username/password against `process.env.ADMIN_USERS` (read at call time).
 * Unknown usernames run the same digest compare against a dummy password, then always fail.
 */
export function verifyAdminCredentials(username: string, password: string): boolean {
  const users = parseAdminUsers(process.env.ADMIN_USERS ?? '');
  const expected = users.get(username);
  if (expected === undefined) {
    passwordsMatch(password, DUMMY_PASSWORD);
    return false;
  }
  return passwordsMatch(password, expected);
}

/** True when at least one admin user and a non-blank session secret are configured. */
export function isAdminEnabled(): boolean {
  const users = parseAdminUsers(process.env.ADMIN_USERS ?? '');
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() ?? '';
  return users.size > 0 && secret.length > 0;
}
