/**
 * Opaque email action tokens (verify / reset) — only keyed hashes are stored.
 */
import { createHash, randomBytes } from 'node:crypto';
import { sessionSecret } from './config.js';

/** Generate a new opaque email token (embedded in links). */
export function generateEmailToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash an email token for lookup in EmailTokenStore (same pepper as session tokens). */
export function hashEmailToken(token: string): string {
  const secret = sessionSecret();
  return createHash('sha256')
    .update(secret, 'utf8')
    .update('\0email-token\0')
    .update(token, 'utf8')
    .digest('hex');
}
