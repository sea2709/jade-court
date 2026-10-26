/**
 * In-process Stripe client for E2E and Vitest — no HTTP calls to Stripe APIs.
 */
import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { stripeSecretKey } from './config.js';

/** Stripe-like checkout URL (allowed by the web checkout redirect guard). */
export function fakeCheckoutUrl(sessionId: string): string {
  return `https://checkout.stripe.com/c/pay/${sessionId}`;
}

/**
 * Stripe SDK client whose `checkout.sessions.create` is local; webhook verification
 * uses the real SDK crypto with `STRIPE_WEBHOOK_SECRET` (no network).
 */
export function createFakeStripeClient(): Stripe {
  const key = stripeSecretKey();
  const base = new Stripe(key);

  const checkoutCreate = async (
    params: Stripe.Checkout.SessionCreateParams,
  ): Promise<Stripe.Checkout.Session> => {
    const id = `cs_test_${randomBytes(12).toString('hex')}`;
    return {
      id,
      object: 'checkout.session',
      url: fakeCheckoutUrl(id),
      mode: params.mode ?? 'payment',
      payment_status: 'unpaid',
      client_reference_id:
        typeof params.client_reference_id === 'string' ? params.client_reference_id : null,
      amount_total: null,
      currency: 'usd',
    } as Stripe.Checkout.Session;
  };

  return Object.assign(base, {
    checkout: {
      sessions: {
        create: checkoutCreate,
      },
    },
  });
}
