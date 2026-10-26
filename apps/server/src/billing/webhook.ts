/**
 * Stripe `checkout.session.completed` handling — idempotent payment insert + access grant.
 */
import type Stripe from 'stripe';
import { ensureAccessUntilAtLeast, extendAccess, grantHoursToMs } from './access.js';
import { playAiAccessHours } from './config.js';
import type { PaymentStore } from './payments/store.js';
import type { UserStore } from '../users/store.js';

function grantWindow(
  user: { accessUntil?: Date },
  now: Date,
  ms: number,
): { grantedFrom: Date; grantedUntil: Date } {
  const base = Math.max(now.getTime(), user.accessUntil?.getTime() ?? now.getTime());
  return {
    grantedFrom: new Date(base),
    grantedUntil: new Date(base + ms),
  };
}

function receiptUrlFromSession(session: Stripe.Checkout.Session): string | undefined {
  const pi = session.payment_intent;
  if (!pi || typeof pi === 'string') return undefined;
  const charge = pi.latest_charge;
  if (!charge || typeof charge === 'string') return undefined;
  return charge.receipt_url ?? undefined;
}

/**
 * Process a verified `checkout.session.completed` event.
 * Unpaid or incomplete sessions are ignored.
 */
export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  deps: { userStore: UserStore; paymentStore: PaymentStore; now: Date },
): Promise<void> {
  if (session.payment_status !== 'paid') return;

  const userId = session.client_reference_id?.trim();
  if (!userId) return;

  const user = await deps.userStore.findById(userId);
  if (!user) return;

  const hours = playAiAccessHours();
  const ms = grantHoursToMs(hours);
  if (ms === null) return;

  const { grantedFrom, grantedUntil } = grantWindow(user, deps.now, ms);
  const amount = session.amount_total ?? 0;
  const currency = (session.currency ?? 'usd').toLowerCase();

  const insertResult = await deps.paymentStore.insertIfNotExists({
    stripeSessionId: session.id,
    userId,
    amount,
    currency,
    grantedFrom,
    grantedUntil,
    receiptUrl: receiptUrlFromSession(session),
    status: 'paid',
    createdAt: deps.now,
  });

  if (!insertResult.inserted) {
    return;
  }

  const extended = await extendAccess(deps.userStore, userId, hours, deps.now);
  if (!extended) {
    await ensureAccessUntilAtLeast(deps.userStore, userId, insertResult.payment.grantedUntil);
  }
}
