/**
 * Lazy Stripe SDK client for Checkout and webhooks.
 */
import Stripe from 'stripe';
import { createFakeStripeClient } from './fakeStripe.js';
import { isStripeConfigured, shouldUseFakeStripe, stripeSecretKey } from './config.js';

let client: Stripe | null = null;

/** Shared Stripe instance when billing env is configured. */
export function getStripe(): Stripe | null {
  if (!isStripeConfigured()) return null;
  if (!client) {
    client = shouldUseFakeStripe() ? createFakeStripeClient() : new Stripe(stripeSecretKey());
  }
  return client;
}

/** Clear cached client (Vitest only). */
export function resetStripeClientForTests(): void {
  client = null;
}
