/**
 * Deterministic Meta data-deletion confirmation codes (32 hex chars).
 */
import { createHmac } from 'node:crypto';

const CODE_LEN = 32;

/** Stable confirmation code for a Facebook app-scoped user id (matches web `dataDeletionCode` format). */
export function facebookDataDeletionConfirmationCode(
  facebookUserId: string,
  appSecret: string,
): string {
  return createHmac('sha256', appSecret)
    .update(`meta-data-deletion:${facebookUserId}`, 'utf8')
    .digest('hex')
    .slice(0, CODE_LEN);
}
