/**
 * Day-pass / play-AI access duration and Stripe Checkout configuration.
 */

const DEFAULT_PLAY_AI_ACCESS_HOURS = 24;

function trimEnv(name: string): string {
  return process.env[name]?.trim() ?? '';
}

/** Maximum hours per grant (env default, admin grant body, and future checkout). */
export const MAX_PLAY_AI_ACCESS_HOURS = 8760;

/**
 * Hours granted per day pass (admin grant default and checkout placeholder).
 * Invalid or non-positive env values fall back to 24; values above {@link MAX_PLAY_AI_ACCESS_HOURS}
 * are clamped to that cap.
 */
export function playAiAccessHours(): number {
  const raw = process.env.PLAY_AI_ACCESS_HOURS?.trim();
  if (!raw) return DEFAULT_PLAY_AI_ACCESS_HOURS;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) {
    return DEFAULT_PLAY_AI_ACCESS_HOURS;
  }
  if (hours > MAX_PLAY_AI_ACCESS_HOURS) {
    return MAX_PLAY_AI_ACCESS_HOURS;
  }
  return hours;
}

/** Stripe secret API key (`STRIPE_SECRET_KEY`). */
export function stripeSecretKey(): string {
  return trimEnv('STRIPE_SECRET_KEY');
}

/** Stripe Price id for the day pass (`STRIPE_PRICE_ID`). */
export function stripePriceId(): string {
  return trimEnv('STRIPE_PRICE_ID');
}

/** Stripe webhook signing secret (`STRIPE_WEBHOOK_SECRET`). */
export function stripeWebhookSecret(): string {
  return trimEnv('STRIPE_WEBHOOK_SECRET');
}

/** Public web origin for Checkout redirect URLs (no trailing slash). */
export function billingPublicAppUrl(): string {
  const raw = trimEnv('PUBLIC_APP_URL');
  if (raw) return raw.replace(/\/+$/, '');
  return 'http://localhost:5173';
}

/** True when Checkout and webhook handlers can call Stripe. */
export function isStripeConfigured(): boolean {
  return (
    stripeSecretKey().length > 0 && stripePriceId().length > 0 && stripeWebhookSecret().length > 0
  );
}

/**
 * When true, checkout requires `emailVerified` on the session user.
 * Set `BILLING_REQUIRE_VERIFIED_EMAIL=false` in dev to test checkout without verifying.
 */
export function billingRequiresVerifiedEmail(): boolean {
  const raw = trimEnv('BILLING_REQUIRE_VERIFIED_EMAIL').toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  return true;
}

/** Reset cached env readers (Vitest only). */
export function resetBillingConfigForTests(): void {
  delete process.env.PLAY_AI_ACCESS_HOURS;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PRICE_ID;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.PUBLIC_APP_URL;
  delete process.env.BILLING_REQUIRE_VERIFIED_EMAIL;
}
