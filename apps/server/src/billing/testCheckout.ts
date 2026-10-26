/**
 * Helpers for test-only checkout completion (E2E / Vitest).
 */
import type Stripe from 'stripe';

/** Minimal paid `checkout.session.completed` object for {@link handleCheckoutSessionCompleted}. */
export function buildPaidCheckoutSessionForTest(
  sessionId: string,
  userId: string,
  overrides: Partial<{
    amount_total: number;
    currency: string;
    receipt_url: string;
  }> = {},
): Stripe.Checkout.Session {
  const amount_total = overrides.amount_total ?? 100;
  const currency = overrides.currency ?? 'usd';
  const receipt_url = overrides.receipt_url;
  return {
    id: sessionId,
    object: 'checkout.session',
    payment_status: 'paid',
    client_reference_id: userId,
    amount_total,
    currency,
    ...(receipt_url
      ? {
          payment_intent: {
            object: 'payment_intent',
            latest_charge: {
              object: 'charge',
              receipt_url,
            },
          },
        }
      : {}),
  } as Stripe.Checkout.Session;
}
