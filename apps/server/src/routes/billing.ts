/**
 * Day-pass billing: Stripe Checkout, webhook, and payment history.
 */
import { Hono } from 'hono';
import type Stripe from 'stripe';
import {
  reserveBillingCheckoutAttempt,
  reserveBillingTestCompleteCheckoutAttempt,
} from '../auth/rateLimit.js';
import { requireVerifiedEmail } from '../auth/requireVerifiedEmail.js';
import {
  billingPublicAppUrl,
  billingRequiresVerifiedEmail,
  isStripeConfigured,
  stripePriceId,
  stripeWebhookSecret,
} from '../billing/config.js';
import type { PaymentStore } from '../billing/payments/store.js';
import { toPublicPayment } from '../billing/payments/types.js';
import {
  claimTestCheckoutSession,
  registerTestCheckoutSession,
} from '../billing/pendingTestCheckout.js';
import { getStripe } from '../billing/stripeClient.js';
import { buildPaidCheckoutSessionForTest } from '../billing/testCheckout.js';
import { handleCheckoutSessionCompleted } from '../billing/webhook.js';
import { requireE2eTestSecret } from '../e2e/testSecret.js';
import { isTestEnv } from '../email/config.js';
import { requireUser } from '../middleware/auth.js';
import type { AppVariables } from '../types/hono.js';
import type { UserStore } from '../users/store.js';

export type BillingRouteDeps = {
  userStore: UserStore;
  paymentStore: PaymentStore;
  /** Optional Stripe client override (Vitest). */
  stripe?: Stripe | null;
};

function billingDisabled(c: { json: (body: unknown, status: number) => Response }) {
  return c.json({ error: 'billing_disabled' }, 503);
}

function resolveStripe(deps: BillingRouteDeps): Stripe | null {
  if (deps.stripe !== undefined) return deps.stripe;
  return getStripe();
}

/** Routes under `/api/billing`. Webhook uses raw body via `c.req.text()`. */
export function createBillingRoutes(deps: BillingRouteDeps) {
  const routes = new Hono<{ Variables: AppVariables }>();

  routes.post('/checkout', requireUser, async (c) => {
    c.header('Cache-Control', 'no-store');
    if (!isStripeConfigured()) {
      return billingDisabled(c);
    }

    const authUser = c.get('user')!;
    if (reserveBillingCheckoutAttempt(authUser.id) === 'limited') {
      return c.json({ error: 'rate_limited' }, 429);
    }
    if (!authUser.email?.trim()) {
      return c.json({ error: 'email_not_verified' }, 403);
    }
    if (billingRequiresVerifiedEmail()) {
      const verified = requireVerifiedEmail(authUser);
      if (!verified.ok) {
        return c.json({ error: verified.error }, 403);
      }
    }

    const stripe = resolveStripe(deps);
    if (!stripe) {
      return billingDisabled(c);
    }

    const base = billingPublicAppUrl();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: stripePriceId(), quantity: 1 }],
      client_reference_id: authUser.id,
      success_url: `${base}/play-ai?checkout=success`,
      cancel_url: `${base}/play-ai`,
    });

    if (!session.url) {
      return c.json({ error: 'checkout_unavailable' }, 503);
    }

    if (isTestEnv() && session.id) {
      registerTestCheckoutSession(authUser.id, session.id);
    }

    return c.json({ url: session.url, sessionId: session.id });
  });

  routes.post('/webhook', async (c) => {
    if (!isStripeConfigured()) {
      return billingDisabled(c);
    }

    const stripe = resolveStripe(deps);
    if (!stripe) {
      return billingDisabled(c);
    }

    const signature = c.req.header('stripe-signature');
    if (!signature) {
      return c.json({ error: 'invalid_signature' }, 400);
    }

    const rawBody = await c.req.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret());
    } catch {
      return c.json({ error: 'invalid_signature' }, 400);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutSessionCompleted(session, {
        userStore: deps.userStore,
        paymentStore: deps.paymentStore,
        now: new Date(),
      });
    }

    return c.json({ received: true });
  });

  if (isTestEnv()) {
    routes.post('/test/complete-checkout', requireUser, async (c) => {
      c.header('Cache-Control', 'no-store');
      const denied = requireE2eTestSecret(c);
      if (denied) return denied;
      if (!isStripeConfigured()) {
        return billingDisabled(c);
      }

      const authUser = c.get('user')!;
      if (reserveBillingTestCompleteCheckoutAttempt(authUser.id) === 'limited') {
        return c.json({ error: 'rate_limited' }, 429);
      }

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'invalid_json' }, 400);
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return c.json({ error: 'invalid_json' }, 400);
      }

      const sessionIdRaw = (body as { sessionId?: unknown }).sessionId;
      if (
        typeof sessionIdRaw !== 'string' ||
        sessionIdRaw.length === 0 ||
        sessionIdRaw.length > 256
      ) {
        return c.json({ error: 'invalid_session_id' }, 400);
      }

      const userIdRaw = (body as { userId?: unknown }).userId;
      let targetUserId = authUser.id;
      if (userIdRaw !== undefined && userIdRaw !== null) {
        if (typeof userIdRaw !== 'string' || userIdRaw.length === 0 || userIdRaw.length > 128) {
          return c.json({ error: 'invalid_user_id' }, 400);
        }
        if (userIdRaw !== authUser.id) {
          return c.json({ error: 'forbidden' }, 403);
        }
        targetUserId = userIdRaw;
      }

      if (!claimTestCheckoutSession(targetUserId, sessionIdRaw)) {
        return c.json({ error: 'unknown_checkout_session' }, 400);
      }

      const session = buildPaidCheckoutSessionForTest(sessionIdRaw, targetUserId);
      await handleCheckoutSessionCompleted(session, {
        userStore: deps.userStore,
        paymentStore: deps.paymentStore,
        now: new Date(),
      });

      return c.json({ ok: true });
    });
  }

  routes.get('/payments', requireUser, async (c) => {
    c.header('Cache-Control', 'no-store');
    if (!isStripeConfigured()) {
      return billingDisabled(c);
    }

    const authUser = c.get('user')!;
    const rows = await deps.paymentStore.listByUserId(authUser.id);
    return c.json({ payments: rows.map(toPublicPayment) });
  });

  return routes;
}
