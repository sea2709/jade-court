/**
 * Email delivery configuration from environment.
 */

export type EmailProviderId = 'console' | 'resend' | 'smtp';

const DEFAULT_VERIFY_TTL_HOURS = 48;
const DEFAULT_RESET_TTL_HOURS = 1;

export function emailProviderId(): EmailProviderId {
  const raw = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (raw === 'resend' || raw === 'smtp' || raw === 'console') {
    return raw;
  }
  return 'console';
}

/** Public web origin for links in emails (no trailing slash). */
export function publicAppUrl(): string {
  const raw = process.env.PUBLIC_APP_URL?.trim();
  if (raw) {
    return raw.replace(/\/+$/, '');
  }
  return 'http://localhost:5173';
}

export function emailFromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || 'noreply@jade-court.local';
}

export function resendApiKey(): string {
  return process.env.RESEND_API_KEY?.trim() ?? '';
}

export function smtpHost(): string {
  return process.env.SMTP_HOST?.trim() ?? '';
}

export function smtpPort(): number {
  const raw = process.env.SMTP_PORT?.trim();
  if (!raw) return 587;
  const port = Number(raw);
  return Number.isFinite(port) && port > 0 ? port : 587;
}

export function smtpUser(): string {
  return process.env.SMTP_USER?.trim() ?? '';
}

export function smtpPass(): string {
  return process.env.SMTP_PASS?.trim() ?? '';
}

export function smtpSecure(): boolean {
  const raw = process.env.SMTP_SECURE?.trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return smtpPort() === 465;
}

export function verifyTokenTtlMs(): number {
  return parsePositiveHours(process.env.EMAIL_VERIFY_TTL_HOURS, DEFAULT_VERIFY_TTL_HOURS);
}

export function resetTokenTtlMs(): number {
  return parsePositiveHours(process.env.EMAIL_RESET_TTL_HOURS, DEFAULT_RESET_TTL_HOURS);
}

function parsePositiveHours(raw: string | undefined, fallbackHours: number): number {
  if (!raw?.trim()) return fallbackHours * 60 * 60 * 1000;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) {
    return fallbackHours * 60 * 60 * 1000;
  }
  return hours * 60 * 60 * 1000;
}

export function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test';
}
