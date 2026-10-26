import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { createApp } from '../app.js';
import { SESSION_COOKIE_NAME } from '../auth/config.js';
import * as billingAccess from '../billing/access.js';
import { revokeAccess } from '../billing/access.js';
import { resetBillingConfigForTests } from '../billing/config.js';
import { MemoryPaymentStore } from '../billing/payments/memoryStore.js';
import { resetStripeClientForTests } from '../billing/stripeClient.js';
import { hashSessionToken } from '../auth/sessionToken.js';
import { resetPlayerAuthRateLimitsForTests } from '../auth/rateLimit.js';
import { MemorySessionStore } from '../users/memorySessionStore.js';
import { MemoryUserStore } from '../users/memoryStore.js';
import { hashPassword } from '../users/password.js';

const SECRET = 'test-session-secret-0123456789abcdef0123456789ab';
const STRIPE_SECRET = 'sk_test_billing_unit_tests';
const WEBHOOK_SECRET = 'whsec_test_billing_webhook_secret';
const PRICE_ID = 'price_test_day_pass';

function setupStripeEnv() {
  process.env.STRIPE_SECRET_KEY = STRIPE_SECRET;
  process.env.STRIPE_PRICE_ID = PRICE_ID;
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.PUBLIC_APP_URL = 'http://localhost:5173';
  process.env.BILLING_REQUIRE_VERIFIED_EMAIL = 'true';
}

function setupAuthEnv() {
  process.env.SESSION_SECRET = SECRET;
  process.env.NODE_ENV = 'test';
}

type MockStripe = {
  checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
  webhooks: { constructEvent: typeof Stripe.prototype.webhooks.constructEvent };
};

function createMockStripe(): MockStripe & Stripe {
  const stripe = new Stripe(STRIPE_SECRET);
  return {
    ...stripe,
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/c/pay/cs_test_123',
        }),
      },
    },
    webhooks: stripe.webhooks,
  } as MockStripe & Stripe;
}

async function createSessionForUser(
  sessionStore: MemorySessionStore,
  userId: string,
): Promise<string> {
  const token = 'session-token-for-billing-tests';
  await sessionStore.create({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + 3600_000),
  });
  return token;
}

function sessionHeaders(token: string): Record<string, string> {
  return { Cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

function signedWebhookPayload(
  stripe: Stripe,
  event: Record<string, unknown>,
): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: WEBHOOK_SECRET,
  });
  return {
    body,
    headers: { 'stripe-signature': signature, 'Content-Type': 'text/plain' },
  };
}

function paidCheckoutSessionEvent(
  sessionId: string,
  userId: string,
  overrides: Partial<{
    payment_status: string;
    amount_total: number;
    receipt_url: string;
  }> = {},
) {
  const payment_status = overrides.payment_status ?? 'paid';
  const amount_total = overrides.amount_total ?? 100;
  const receipt_url = overrides.receipt_url;
  return {
    id: 'evt_test',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_status,
        client_reference_id: userId,
        amount_total,
        currency: 'usd',
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
      },
    },
  };
}

describe('billing routes', () => {
  let userStore: MemoryUserStore;
  let sessionStore: MemorySessionStore;
  let paymentStore: MemoryPaymentStore;
  let mockStripe: MockStripe & Stripe;
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let sessionToken: string;

  beforeEach(async () => {
    resetPlayerAuthRateLimitsForTests();
    resetBillingConfigForTests();
    resetStripeClientForTests();
    setupAuthEnv();
    setupStripeEnv();

    userStore = new MemoryUserStore();
    sessionStore = new MemorySessionStore();
    paymentStore = new MemoryPaymentStore();
    mockStripe = createMockStripe();

    app = createApp({
      newsStore: null,
      userStore,
      sessionStore,
      paymentStore,
      stripe: mockStripe,
    });

    const user = await userStore.create({
      email: 'buyer@example.com',
      passwordHash: await hashPassword('password12'),
    });
    userId = user.id;
    await userStore.setEmailVerified(userId, true);
    sessionToken = await createSessionForUser(sessionStore, userId);
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.NODE_ENV;
    resetBillingConfigForTests();
    resetStripeClientForTests();
    resetPlayerAuthRateLimitsForTests();
    vi.restoreAllMocks();
  });

  describe('POST /api/billing/checkout', () => {
    it('returns 503 when Stripe is not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const res = await app.request('/api/billing/checkout', {
        method: 'POST',
        headers: sessionHeaders(sessionToken),
      });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'billing_disabled' });
    });

    it('returns 401 without a session', async () => {
      const res = await app.request('/api/billing/checkout', { method: 'POST' });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    });

    it('returns 403 when email is not verified', async () => {
      await userStore.setEmailVerified(userId, false);
      const res = await app.request('/api/billing/checkout', {
        method: 'POST',
        headers: sessionHeaders(sessionToken),
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'email_not_verified' });
    });

    it('returns 403 when the account has no email address', async () => {
      const blankEmailUser = await userStore.create({
        email: '   ',
        passwordHash: await hashPassword('password12'),
      });
      await userStore.setEmailVerified(blankEmailUser.id, true);
      const token = await createSessionForUser(sessionStore, blankEmailUser.id);
      const res = await app.request('/api/billing/checkout', {
        method: 'POST',
        headers: sessionHeaders(token),
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'email_not_verified' });
    });

    it('creates a Checkout session for a verified user', async () => {
      const res = await app.request('/api/billing/checkout', {
        method: 'POST',
        headers: sessionHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { url: string };
      expect(body.url).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith({
        mode: 'payment',
        line_items: [{ price: PRICE_ID, quantity: 1 }],
        client_reference_id: userId,
        success_url: 'http://localhost:5173/play-ai?checkout=success',
        cancel_url: 'http://localhost:5173/play-ai',
      });
    });
  });

  describe('POST /api/billing/webhook', () => {
    it('rejects a bad signature', async () => {
      const res = await app.request('/api/billing/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'bad', 'Content-Type': 'text/plain' },
        body: '{}',
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_signature' });
    });

    it('grants 24 hours on a paid checkout.session.completed', async () => {
      const sessionId = 'cs_paid_once';
      const { body, headers } = signedWebhookPayload(
        mockStripe,
        paidCheckoutSessionEvent(sessionId, userId, {
          receipt_url: 'https://pay.stripe.com/receipts/test',
        }),
      );
      const before = Date.now();
      const res = await app.request('/api/billing/webhook', {
        method: 'POST',
        headers,
        body,
      });
      expect(res.status).toBe(200);

      const user = await userStore.findById(userId);
      const expectedEnd = before + 24 * 60 * 60 * 1000;
      expect(user?.accessUntil?.getTime()).toBeGreaterThanOrEqual(expectedEnd - 500);
      expect(user?.accessUntil?.getTime()).toBeLessThanOrEqual(expectedEnd + 500);

      const payments = await paymentStore.listByUserId(userId);
      expect(payments).toHaveLength(1);
      expect(payments[0].stripeSessionId).toBe(sessionId);
      expect(payments[0].receiptUrl).toBe('https://pay.stripe.com/receipts/test');
    });

    it('heals access when extend fails on first delivery and replay does not stack hours', async () => {
      const sessionId = 'cs_heal_replay';
      const event = paidCheckoutSessionEvent(sessionId, userId);
      const extendSpy = vi.spyOn(billingAccess, 'extendAccess').mockResolvedValueOnce(null);

      const first = signedWebhookPayload(mockStripe, event);
      await app.request('/api/billing/webhook', {
        method: 'POST',
        headers: first.headers,
        body: first.body,
      });

      const [payment] = await paymentStore.listByUserId(userId);
      let user = await userStore.findById(userId);
      expect(user?.accessUntil?.getTime()).toBe(payment.grantedUntil.getTime());

      extendSpy.mockRestore();

      const second = signedWebhookPayload(mockStripe, event);
      await app.request('/api/billing/webhook', {
        method: 'POST',
        headers: second.headers,
        body: second.body,
      });

      user = await userStore.findById(userId);
      expect(user?.accessUntil?.getTime()).toBe(payment.grantedUntil.getTime());
      expect(await paymentStore.listByUserId(userId)).toHaveLength(1);
    });

    it('does not double-grant on webhook replay', async () => {
      const sessionId = 'cs_replay';
      const event = paidCheckoutSessionEvent(sessionId, userId);
      const first = signedWebhookPayload(mockStripe, event);
      await app.request('/api/billing/webhook', {
        method: 'POST',
        headers: first.headers,
        body: first.body,
      });
      const userAfterFirst = await userStore.findById(userId);
      const untilFirst = userAfterFirst?.accessUntil?.getTime();

      const second = signedWebhookPayload(mockStripe, event);
      await app.request('/api/billing/webhook', {
        method: 'POST',
        headers: second.headers,
        body: second.body,
      });
      const userAfterSecond = await userStore.findById(userId);
      expect(userAfterSecond?.accessUntil?.getTime()).toBe(untilFirst);
      expect(await paymentStore.listByUserId(userId)).toHaveLength(1);
    });

    it('does not restore access on webhook replay after admin revoke', async () => {
      const sessionId = 'cs_revoked_replay';
      const event = paidCheckoutSessionEvent(sessionId, userId);
      const first = signedWebhookPayload(mockStripe, event);
      await app.request('/api/billing/webhook', {
        method: 'POST',
        headers: first.headers,
        body: first.body,
      });
      expect((await userStore.findById(userId))?.accessUntil).toBeTruthy();

      await revokeAccess(userStore, userId);
      expect((await userStore.findById(userId))?.accessUntil).toBeUndefined();

      const second = signedWebhookPayload(mockStripe, event);
      await app.request('/api/billing/webhook', {
        method: 'POST',
        headers: second.headers,
        body: second.body,
      });
      expect((await userStore.findById(userId))?.accessUntil).toBeUndefined();
    });

    it('stacks access on a second purchase', async () => {
      const first = signedWebhookPayload(
        mockStripe,
        paidCheckoutSessionEvent('cs_stack_1', userId),
      );
      await app.request('/api/billing/webhook', {
        method: 'POST',
        headers: first.headers,
        body: first.body,
      });
      const afterFirst = await userStore.findById(userId);
      const untilFirst = afterFirst?.accessUntil?.getTime();
      expect(untilFirst).toBeTypeOf('number');
      const stackedFrom = untilFirst as number;

      const second = signedWebhookPayload(
        mockStripe,
        paidCheckoutSessionEvent('cs_stack_2', userId),
      );
      await app.request('/api/billing/webhook', {
        method: 'POST',
        headers: second.headers,
        body: second.body,
      });
      const afterSecond = await userStore.findById(userId);
      expect(afterSecond?.accessUntil?.getTime()).toBe(stackedFrom + 24 * 60 * 60 * 1000);
      expect(await paymentStore.listByUserId(userId)).toHaveLength(2);
    });

    it('ignores unpaid checkout.session.completed', async () => {
      const { body, headers } = signedWebhookPayload(
        mockStripe,
        paidCheckoutSessionEvent('cs_unpaid', userId, { payment_status: 'unpaid' }),
      );
      const res = await app.request('/api/billing/webhook', {
        method: 'POST',
        headers,
        body,
      });
      expect(res.status).toBe(200);
      const user = await userStore.findById(userId);
      expect(user?.accessUntil).toBeUndefined();
      expect(await paymentStore.listByUserId(userId)).toHaveLength(0);
    });
  });

  describe('GET /api/billing/payments', () => {
    it('returns only the caller payments newest first', async () => {
      const other = await userStore.create({
        email: 'other@example.com',
        passwordHash: await hashPassword('password12'),
      });

      const now = new Date();
      await paymentStore.insertIfNotExists({
        stripeSessionId: 'cs_old',
        userId,
        amount: 100,
        currency: 'usd',
        grantedFrom: now,
        grantedUntil: new Date(now.getTime() + 3600_000),
        status: 'paid',
        createdAt: new Date(now.getTime() - 3600_000),
      });
      await paymentStore.insertIfNotExists({
        stripeSessionId: 'cs_new',
        userId,
        amount: 100,
        currency: 'usd',
        grantedFrom: now,
        grantedUntil: new Date(now.getTime() + 7200_000),
        status: 'paid',
        createdAt: now,
      });
      await paymentStore.insertIfNotExists({
        stripeSessionId: 'cs_other',
        userId: other.id,
        amount: 100,
        currency: 'usd',
        grantedFrom: now,
        grantedUntil: now,
        status: 'paid',
        createdAt: now,
      });

      const res = await app.request('/api/billing/payments', {
        headers: sessionHeaders(sessionToken),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        payments: { stripeSessionId: string; createdAt: string }[];
      };
      expect(body.payments).toHaveLength(2);
      expect(body.payments[0].stripeSessionId).toBe('cs_new');
      expect(body.payments[1].stripeSessionId).toBe('cs_old');
    });

    it('returns 401 without a session', async () => {
      const res = await app.request('/api/billing/payments');
      expect(res.status).toBe(401);
    });
  });
});
