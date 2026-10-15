/**
 * HMAC-signed admin session Bearer tokens (`sub` + `exp`, verified with timing-safe compare).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isAdminEnabled, parseAdminUsers } from './users.js';

export type VerifySessionResult =
  { status: 'valid'; username: string } | { status: 'invalid_auth' } | { status: 'unauthorized' };

function sessionTtlHours(): number {
  const raw = process.env.ADMIN_SESSION_TTL_HOURS?.trim();
  if (!raw) return 8;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 8;
  return n;
}

function sessionSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() ?? '';
  return secret.length > 0 ? secret : null;
}

function signPayload(payloadPart: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

/** Issue a signed session token for `username`. Requires admin config to be enabled. */
export function createSessionToken(username: string): { token: string; expiresAt: string } {
  const secret = sessionSecret();
  if (!secret || !isAdminEnabled()) {
    throw new Error('admin_disabled');
  }
  const ttlHours = sessionTtlHours();
  const exp = Math.floor(Date.now() / 1000) + Math.floor(ttlHours * 3600);
  const payloadPart = Buffer.from(JSON.stringify({ sub: username, exp }), 'utf8').toString(
    'base64url',
  );
  const sig = signPayload(payloadPart, secret);
  const token = `${payloadPart}.${sig}`;
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

/**
 * Verify a Bearer session token. Malformed or bad signature → `invalid_auth` (rate-limit bucket).
 * Expired or revoked user → `unauthorized` (no bucket).
 */
export function verifySessionToken(
  token: string,
  nowSec = Math.floor(Date.now() / 1000),
): VerifySessionResult {
  const secret = sessionSecret();
  if (!secret || !isAdminEnabled()) {
    return { status: 'unauthorized' };
  }

  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) {
    return { status: 'invalid_auth' };
  }
  const payloadPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);

  const expectedSig = signPayload(payloadPart, secret);
  const a = Buffer.from(sigPart);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { status: 'invalid_auth' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    return { status: 'invalid_auth' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { status: 'invalid_auth' };
  }
  const sub = (parsed as { sub?: unknown }).sub;
  const exp = (parsed as { exp?: unknown }).exp;
  if (typeof sub !== 'string' || typeof exp !== 'number' || !Number.isFinite(exp)) {
    return { status: 'invalid_auth' };
  }

  if (exp <= nowSec) {
    return { status: 'unauthorized' };
  }

  const users = parseAdminUsers(process.env.ADMIN_USERS ?? '');
  if (!users.has(sub)) {
    return { status: 'unauthorized' };
  }

  return { status: 'valid', username: sub };
}
