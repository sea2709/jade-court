/**
 * In-memory SessionStore for tests and when MongoDB is not configured.
 */
import type { SessionRecord, SessionStore } from './sessionStore.js';

export class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, SessionRecord>();

  async create(record: SessionRecord): Promise<void> {
    this.sessions.set(record.tokenHash, { ...record });
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const row = this.sessions.get(tokenHash);
    if (!row) return null;
    return { ...row };
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  /** Test helper: force-expire a session by hash. */
  expireForTests(tokenHash: string): void {
    const row = this.sessions.get(tokenHash);
    if (row) {
      row.expiresAt = new Date(0);
    }
  }
}
