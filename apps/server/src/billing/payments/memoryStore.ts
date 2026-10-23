/**
 * In-memory PaymentStore for tests and when MongoDB is not configured.
 */
import { randomUUID } from 'node:crypto';
import type { InsertPaymentInput, PaymentRecord } from './types.js';
import type { InsertPaymentResult, PaymentStore } from './store.js';

export class MemoryPaymentStore implements PaymentStore {
  private bySessionId = new Map<string, PaymentRecord>();

  async insertIfNotExists(input: InsertPaymentInput): Promise<InsertPaymentResult> {
    const existing = this.bySessionId.get(input.stripeSessionId);
    if (existing) {
      return { inserted: false, payment: { ...existing } };
    }
    const payment: PaymentRecord = {
      id: randomUUID(),
      ...input,
    };
    this.bySessionId.set(input.stripeSessionId, payment);
    return { inserted: true, payment: { ...payment } };
  }

  async listByUserId(userId: string): Promise<PaymentRecord[]> {
    const rows = [...this.bySessionId.values()].filter((p) => p.userId === userId);
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return rows.map((p) => ({ ...p }));
  }
}
