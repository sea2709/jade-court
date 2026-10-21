/**
 * One-time startup warnings for player session configuration.
 */

let loggedMissingSecret = false;
let loggedShortSecret = false;

/** Log player session misconfiguration once per process. */
export function warnPlayerAuthConfigAtStartup(): void {
  const secret = process.env.SESSION_SECRET?.trim() ?? '';
  if (!secret) {
    if (!loggedMissingSecret) {
      console.warn(
        'Player auth: SESSION_SECRET is missing — set a 32+ char random secret (e.g. openssl rand -hex 32)',
      );
      loggedMissingSecret = true;
    }
    return;
  }

  if (secret.length < 32 && !loggedShortSecret) {
    console.warn(
      'Player auth: SESSION_SECRET is shorter than 32 characters — use a longer random secret (e.g. openssl rand -hex 32)',
    );
    loggedShortSecret = true;
  }
}

/** Reset warning flags (Vitest only). */
export function resetPlayerAuthStartupWarningsForTests(): void {
  loggedMissingSecret = false;
  loggedShortSecret = false;
}
