/**
 * One-time startup warnings for half-configured integrations (OAuth, Stripe, email).
 */
import {
  facebookAppId,
  facebookAppSecret,
  googleClientId,
  googleClientSecret,
} from '../auth/oauth/config.js';
import { isStripePartiallyConfigured } from '../billing/config.js';
import { emailProviderId, resendApiKey } from '../email/config.js';

const logged = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (logged.has(key)) return;
  console.warn(message);
  logged.add(key);
}

/** Log misconfigured OAuth, Stripe, or email once per process. */
export function warnIntegrationsConfigAtStartup(): void {
  const googleId = googleClientId();
  const googleSecret = googleClientSecret();
  if (googleId && !googleSecret) {
    warnOnce(
      'google-oauth-partial',
      'Google OAuth: GOOGLE_CLIENT_ID is set without GOOGLE_CLIENT_SECRET — sign-in will not work',
    );
  }
  if (!googleId && googleSecret) {
    warnOnce(
      'google-oauth-secret-only',
      'Google OAuth: GOOGLE_CLIENT_SECRET is set without GOOGLE_CLIENT_ID',
    );
  }

  const fbId = facebookAppId();
  const fbSecret = facebookAppSecret();
  if (fbId && !fbSecret) {
    warnOnce(
      'facebook-oauth-partial',
      'Facebook OAuth: FACEBOOK_APP_ID is set without FACEBOOK_APP_SECRET — sign-in will not work',
    );
  }
  if (!fbId && fbSecret) {
    warnOnce(
      'facebook-oauth-secret-only',
      'Facebook OAuth: FACEBOOK_APP_SECRET is set without FACEBOOK_APP_ID',
    );
  }

  if (isStripePartiallyConfigured()) {
    warnOnce(
      'stripe-partial',
      'Billing: set all of STRIPE_SECRET_KEY, STRIPE_PRICE_ID, and STRIPE_WEBHOOK_SECRET (partial config ignored)',
    );
  }

  if (emailProviderId() === 'resend' && !resendApiKey()) {
    warnOnce(
      'resend-missing-key',
      'Email: EMAIL_PROVIDER=resend but RESEND_API_KEY is missing — verification emails will fail',
    );
  }
}

/** Reset warning flags (Vitest only). */
export function resetIntegrationsStartupWarningsForTests(): void {
  logged.clear();
}
