/**
 * In-memory PaymentStore for tests and when MongoDB is not configured.
 */
import { randomUUID } from 'node:crypto';
import { decodeNewsCursor, encodeNewsCursor, isBeforeCursor } from '../../news/cursor.js';
import { InvalidCursorError } from '../../news/memoryStore.js';
import type { InsertPaymentInput, PaymentRecord } from './types.js';
import type {
  InsertPaymentResult,
  ListPaymentsByUserOptions,
  PaymentListOptions,
  PaymentListResult,
  PaymentStore,
} from './store.js';

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

  async listByUserId(
    userId: string,
    options?: ListPaymentsByUserOptions,
  ): Promise<PaymentRecord[]> {
    const rows = [...this.bySessionId.values()].filter((p) => p.userId === userId);
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const capped = options?.limit !== undefined ? rows.slice(0, options.limit) : rows;
    return capped.map((p) => ({ ...p }));
  }

  async listRecent(options: PaymentListOptions): Promise<PaymentListResult> {
    let rows = [...this.bySessionId.values()];
    rows.sort((a, b) => {
      const t = b.createdAt.getTime() - a.createdAt.getTime();
      if (t !== 0) return t;
      return b.id.localeCompare(a.id);
    });

    if (options.cursor) {
      const decoded = decodeNewsCursor(options.cursor);
      if (!decoded) throw new InvalidCursorError();
      rows = rows.filter((p) => isBeforeCursor({ sortAt: p.createdAt, id: p.id }, decoded));
    }

    const limit = options.limit;
    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeNewsCursor(last.createdAt, last.id) : null;

    return { payments: page.map((p) => ({ ...p })), nextCursor };
  }
}
