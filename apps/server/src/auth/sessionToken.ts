/**
 * Opaque session tokens — only a keyed hash is stored server-side.
 */
import { createHash, randomBytes } from 'node:crypto';
import { sessionSecret } from './config.js';

/** Generate a new opaque session token (send to client in cookie). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash a session token for lookup in SessionStore. */
export function hashSessionToken(token: string): string {
  const secret = sessionSecret();
  return createHash('sha256')
    .update(secret, 'utf8')
    .update('\0')
    .update(token, 'utf8')
    .digest('hex');
}
