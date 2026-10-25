/**
 * In-memory data-deletion records for tests and when MongoDB is not configured.
 */
import type { DataDeletionRecord, DataDeletionStore } from './dataDeletionStore.js';

export class MemoryDataDeletionStore implements DataDeletionStore {
  private byCode = new Map<string, DataDeletionRecord>();

  async record(entry: DataDeletionRecord): Promise<void> {
    const code = entry.confirmationCode.toLowerCase();
    this.byCode.set(code, {
      confirmationCode: code,
      facebookUserId: entry.facebookUserId,
      deletedAt: entry.deletedAt,
    });
  }

  async findByConfirmationCode(code: string): Promise<DataDeletionRecord | null> {
    const row = this.byCode.get(code.trim().toLowerCase());
    return row ? { ...row } : null;
  }
}
