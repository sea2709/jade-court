/**
 * Payment persistence for Stripe Checkout day passes.
 */
import type { InsertPaymentInput, PaymentRecord } from './types.js';

export type InsertPaymentResult =
  { inserted: true; payment: PaymentRecord } | { inserted: false; payment: PaymentRecord };

export interface PaymentStore {
  /**
   * Insert a paid session once. Duplicate `stripeSessionId` returns `inserted: false`
   * with the existing row (idempotent webhook replays).
   */
  insertIfNotExists(input: InsertPaymentInput): Promise<InsertPaymentResult>;

  /** Caller payments, newest `createdAt` first. */
  listByUserId(userId: string): Promise<PaymentRecord[]>;
}
