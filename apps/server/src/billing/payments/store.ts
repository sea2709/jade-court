/**
 * Payment persistence for Stripe Checkout day passes.
 */
import type { InsertPaymentInput, PaymentRecord } from './types.js';

export type InsertPaymentResult =
  { inserted: true; payment: PaymentRecord } | { inserted: false; payment: PaymentRecord };

export type PaymentListOptions = {
  limit: number;
  cursor?: string;
};

export type ListPaymentsByUserOptions = {
  limit?: number;
};

export type PaymentListResult = {
  payments: PaymentRecord[];
  nextCursor: string | null;
};

export interface PaymentStore {
  /**
   * Insert a paid session once. Duplicate `stripeSessionId` returns `inserted: false`
   * with the existing row (idempotent webhook replays).
   */
  insertIfNotExists(input: InsertPaymentInput): Promise<InsertPaymentResult>;

  /** Caller payments, newest `createdAt` first. Optional `limit` caps rows at the store. */
  listByUserId(userId: string, options?: ListPaymentsByUserOptions): Promise<PaymentRecord[]>;

  /** All payments, newest `createdAt` first (admin). */
  listRecent(options: PaymentListOptions): Promise<PaymentListResult>;
}
