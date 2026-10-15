/**
 * One-time startup warnings for admin session configuration.
 */

let loggedMissingSecret = false;
let loggedShortSecret = false;

/** Log admin session misconfiguration once per process (see issue #50). */
export function warnAdminConfigAtStartup(): void {
  const usersRaw = process.env.ADMIN_USERS?.trim();
  if (!usersRaw) return;

  const secret = process.env.ADMIN_SESSION_SECRET?.trim() ?? '';
  if (!secret) {
    if (!loggedMissingSecret) {
      console.warn(
        'Admin: ADMIN_USERS is set but ADMIN_SESSION_SECRET is missing — admin routes return 503 admin_disabled',
      );
      loggedMissingSecret = true;
    }
    return;
  }

  if (secret.length < 32 && !loggedShortSecret) {
    console.warn(
      'Admin: ADMIN_SESSION_SECRET is shorter than 32 characters — use a longer random secret (e.g. openssl rand -hex 32)',
    );
    loggedShortSecret = true;
  }
}

/** Reset warning flags (Vitest only). */
export function resetAdminStartupWarningsForTests(): void {
  loggedMissingSecret = false;
  loggedShortSecret = false;
}
