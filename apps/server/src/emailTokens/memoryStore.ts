/**
 * In-memory EmailTokenStore for tests and when MongoDB is not configured.
 */
import type { EmailTokenKind, EmailTokenRecord, EmailTokenStore } from './store.js';

export class MemoryEmailTokenStore implements EmailTokenStore {
  private tokens = new Map<string, EmailTokenRecord>();

  async create(record: EmailTokenRecord): Promise<void> {
    this.tokens.set(record.tokenHash, { ...record });
  }

  async findByTokenHash(tokenHash: string, now = new Date()): Promise<EmailTokenRecord | null> {
    const row = this.tokens.get(tokenHash);
    if (!row) return null;
    if (row.expiresAt.getTime() <= now.getTime()) {
      this.tokens.delete(tokenHash);
      return null;
    }
    return { ...row };
  }

  async consumeByTokenHash(tokenHash: string, now = new Date()): Promise<EmailTokenRecord | null> {
    const row = this.tokens.get(tokenHash);
    if (!row) return null;
    if (row.expiresAt.getTime() <= now.getTime()) {
      this.tokens.delete(tokenHash);
      return null;
    }
    this.tokens.delete(tokenHash);
    return { ...row };
  }

  async deleteByUserIdAndKind(userId: string, kind: EmailTokenKind): Promise<void> {
    for (const [hash, row] of this.tokens) {
      if (row.userId === userId && row.kind === kind) {
        this.tokens.delete(hash);
      }
    }
  }
}
