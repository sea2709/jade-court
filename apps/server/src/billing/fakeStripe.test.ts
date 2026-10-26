import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { resetBillingConfigForTests, stripeWebhookSecret } from './config.js';
import { createFakeStripeClient } from './fakeStripe.js';
import { resetStripeClientForTests } from './stripeClient.js';

const STRIPE_SECRET = 'sk_test_fake_stripe_unit';
const WEBHOOK_SECRET = 'whsec_fake_stripe_webhook_secret';
const PRICE_ID = 'price_test_day';

describe('createFakeStripeClient', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = STRIPE_SECRET;
    process.env.STRIPE_PRICE_ID = PRICE_ID;
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    resetStripeClientForTests();
  });

  afterEach(() => {
    resetBillingConfigForTests();
    resetStripeClientForTests();
  });

  it('creates checkout sessions locally without calling Stripe APIs', async () => {
    const stripe = createFakeStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      client_reference_id: 'user-1',
    });
    expect(session.id).toMatch(/^cs_test_/);
    expect(session.url).toContain('checkout.stripe.com');
  });

  it('constructEvent verifies signatures with STRIPE_WEBHOOK_SECRET', () => {
    const stripe = createFakeStripeClient();
    const payload = JSON.stringify({
      id: 'evt_test',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_abc' } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: stripeWebhookSecret(),
    });
    const event = stripe.webhooks.constructEvent(payload, signature, stripeWebhookSecret());
    expect(event.type).toBe('checkout.session.completed');
  });

  it('rejects invalid webhook signatures', () => {
    const stripe = createFakeStripeClient();
    expect(() =>
      stripe.webhooks.constructEvent('{}', 'bad-signature', stripeWebhookSecret()),
    ).toThrow();
  });

  it('uses the same constructEvent behavior as a real Stripe client', () => {
    const fake = createFakeStripeClient();
    const real = new Stripe(STRIPE_SECRET);
    const payload = '{"id":"evt_x"}';
    const signature = real.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    expect(fake.webhooks.constructEvent(payload, signature, WEBHOOK_SECRET).id).toBe('evt_x');
  });
});
