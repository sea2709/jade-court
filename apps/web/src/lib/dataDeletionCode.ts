/**
 * Meta Facebook data-deletion status URL — confirmation code from query `code`.
 * Server mints 32 hex chars (`randomBytes(16).toString('hex')`).
 */
const CONFIRMATION_CODE_RE = /^[a-f0-9]{32}$/i;

/** True when `code` matches the server-issued deletion confirmation format. */
export function isValidDataDeletionConfirmationCode(code: string): boolean {
  const trimmed = code.trim();
  return trimmed.length > 0 && CONFIRMATION_CODE_RE.test(trimmed);
}

/** Normalize for display (lowercase hex). */
export function normalizeDataDeletionConfirmationCode(code: string): string {
  return code.trim().toLowerCase();
}
