/**
 * Gate paid / sensitive flows until the player verifies email (#80).
 */

export type RequireVerifiedEmailResult = { ok: true } | { ok: false; error: 'email_not_verified' };

/** Returns an error object when `emailVerified` is false. */
export function requireVerifiedEmail(user: { emailVerified: boolean }): RequireVerifiedEmailResult {
  if (!user.emailVerified) {
    return { ok: false, error: 'email_not_verified' };
  }
  return { ok: true };
}
