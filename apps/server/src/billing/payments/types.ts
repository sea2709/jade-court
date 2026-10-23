/**
 * Stored payment records for day-pass Checkout purchases.
 */

export type PaymentStatus = 'paid' | 'refunded';

/** Payment row in Mongo or memory. */
export type PaymentRecord = {
  id: string;
  stripeSessionId: string;
  userId: string;
  amount: number;
  currency: string;
  grantedFrom: Date;
  grantedUntil: Date;
  receiptUrl?: string;
  status: PaymentStatus;
  createdAt: Date;
};

export type InsertPaymentInput = {
  stripeSessionId: string;
  userId: string;
  amount: number;
  currency: string;
  grantedFrom: Date;
  grantedUntil: Date;
  receiptUrl?: string;
  status: PaymentStatus;
  createdAt: Date;
};

/** JSON shape for `GET /api/billing/payments`. */
export type PublicPayment = {
  id: string;
  stripeSessionId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  grantedFrom: string;
  grantedUntil: string;
  receiptUrl?: string;
};

export function toPublicPayment(record: PaymentRecord): PublicPayment {
  return {
    id: record.id,
    stripeSessionId: record.stripeSessionId,
    amount: record.amount,
    currency: record.currency,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    grantedFrom: record.grantedFrom.toISOString(),
    grantedUntil: record.grantedUntil.toISOString(),
    ...(record.receiptUrl ? { receiptUrl: record.receiptUrl } : {}),
  };
}
