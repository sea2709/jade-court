/**
 * Auth email link builders (web routes implement the paths).
 */
import { publicAppUrl } from './config.js';

export function verifyEmailLink(token: string): string {
  return `${publicAppUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function resetPasswordLink(token: string): string {
  return `${publicAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}
