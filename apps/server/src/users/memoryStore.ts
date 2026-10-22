/**
 * In-memory UserStore for tests and when MongoDB is not configured.
 */
import { randomUUID } from 'node:crypto';
import { EmailTakenError, type CreateUserInput, type UserStore } from './store.js';
import type { UserRecord } from './types.js';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class MemoryUserStore implements UserStore {
  private byId = new Map<string, UserRecord>();
  private byEmail = new Map<string, string>();

  /** Snapshot for tests. */
  all(): UserRecord[] {
    return [...this.byId.values()];
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const email = normalizeEmail(input.email);
    if (this.byEmail.has(email)) {
      throw new EmailTakenError();
    }
    const id = randomUUID();
    const record: UserRecord = {
      id,
      email,
      emailVerified: false,
      passwordHash: input.passwordHash,
      ...(input.displayName ? { displayName: input.displayName.trim() } : {}),
      identities: [],
      createdAt: new Date(),
    };
    this.byId.set(id, record);
    this.byEmail.set(email, id);
    return { ...record };
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const id = this.byEmail.get(normalizeEmail(email));
    if (!id) return null;
    const user = this.byId.get(id);
    return user ? { ...user } : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = this.byId.get(id);
    return user ? { ...user } : null;
  }

  async extendAccess(userId: string, ms: number, now: Date): Promise<UserRecord | null> {
    const user = this.byId.get(userId);
    if (!user) return null;
    const base = Math.max(now.getTime(), user.accessUntil?.getTime() ?? now.getTime());
    const accessUntil = new Date(base + ms);
    const updated: UserRecord = { ...user, accessUntil };
    this.byId.set(userId, updated);
    return { ...updated };
  }
}
