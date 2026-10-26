import { afterEach, describe, expect, it } from 'vitest';
import {
  billingPublicAppUrl,
  billingRequiresVerifiedEmail,
  isStripePartiallyConfigured,
  shouldUseFakeStripe,
  isStripeConfigured,
  MAX_PLAY_AI_ACCESS_HOURS,
  playAiAccessHours,
  resetBillingConfigForTests,
} from './config.js';

describe('playAiAccessHours', () => {
  afterEach(() => {
    resetBillingConfigForTests();
  });

  it('defaults to 24 when unset', () => {
    expect(playAiAccessHours()).toBe(24);
  });

  it('reads a positive finite value', () => {
    process.env.PLAY_AI_ACCESS_HOURS = '48';
    expect(playAiAccessHours()).toBe(48);
  });

  it('falls back to 24 for invalid values', () => {
    for (const bad of ['0', '-1', 'abc', 'Infinity', '']) {
      process.env.PLAY_AI_ACCESS_HOURS = bad;
      expect(playAiAccessHours()).toBe(24);
    }
  });

  it('clamps env values above the max grant cap', () => {
    process.env.PLAY_AI_ACCESS_HOURS = '20000';
    expect(playAiAccessHours()).toBe(MAX_PLAY_AI_ACCESS_HOURS);
  });

  it('allows the max cap exactly', () => {
    process.env.PLAY_AI_ACCESS_HOURS = String(MAX_PLAY_AI_ACCESS_HOURS);
    expect(playAiAccessHours()).toBe(MAX_PLAY_AI_ACCESS_HOURS);
  });
});

describe('Stripe billing config', () => {
  afterEach(() => {
    resetBillingConfigForTests();
    delete process.env.NODE_ENV;
  });

  it('isStripeConfigured requires all three secrets', () => {
    expect(isStripeConfigured()).toBe(false);
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    expect(isStripeConfigured()).toBe(false);
    process.env.STRIPE_PRICE_ID = 'price_1';
    expect(isStripeConfigured()).toBe(false);
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_1';
    expect(isStripeConfigured()).toBe(true);
  });

  it('billingPublicAppUrl strips trailing slashes', () => {
    process.env.PUBLIC_APP_URL = 'http://localhost:5173///';
    expect(billingPublicAppUrl()).toBe('http://localhost:5173');
  });

  it('billingRequiresVerifiedEmail defaults to true and respects env', () => {
    expect(billingRequiresVerifiedEmail()).toBe(true);
    process.env.BILLING_REQUIRE_VERIFIED_EMAIL = 'false';
    expect(billingRequiresVerifiedEmail()).toBe(false);
  });

  it('isStripePartiallyConfigured when only some vars are set', () => {
    expect(isStripePartiallyConfigured()).toBe(false);
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    expect(isStripePartiallyConfigured()).toBe(true);
    process.env.STRIPE_PRICE_ID = 'price_1';
    expect(isStripePartiallyConfigured()).toBe(true);
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_1';
    expect(isStripePartiallyConfigured()).toBe(false);
  });

  it('shouldUseFakeStripe in test env or STRIPE_E2E_FAKE', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.STRIPE_PRICE_ID = 'price_1';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_1';
    process.env.NODE_ENV = 'test';
    expect(shouldUseFakeStripe()).toBe(true);
    process.env.NODE_ENV = 'development';
    expect(shouldUseFakeStripe()).toBe(false);
    process.env.STRIPE_E2E_FAKE = '1';
    expect(shouldUseFakeStripe()).toBe(true);
  });
});
