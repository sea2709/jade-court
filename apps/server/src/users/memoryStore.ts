/**
 * In-memory UserStore for tests and when MongoDB is not configured.
 */
import { randomUUID } from 'node:crypto';
import { decodeNewsCursor, encodeNewsCursor, isBeforeCursor } from '../news/cursor.js';
import { InvalidCursorError } from '../news/memoryStore.js';
import {
  EmailTakenError,
  IdentityTakenError,
  LastSignInMethodError,
  type CreateOAuthUserInput,
  type CreateUserInput,
  type UserEmailSearchOptions,
  type UserEmailSearchResult,
  type UserStore,
} from './store.js';
import type { UserIdentity, UserRecord } from './types.js';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function identityIndexKey(provider: string, sub: string): string {
  return `${provider}\0${sub}`;
}

export class MemoryUserStore implements UserStore {
  private byId = new Map<string, UserRecord>();
  private byEmail = new Map<string, string>();
  private byIdentity = new Map<string, string>();

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

  async createOAuthUser(input: CreateOAuthUserInput): Promise<UserRecord> {
    const identityKey = identityIndexKey(input.identity.provider, input.identity.sub);
    if (this.byIdentity.has(identityKey)) {
      throw new IdentityTakenError();
    }
    let email: string | undefined;
    if (input.email) {
      email = normalizeEmail(input.email);
      if (this.byEmail.has(email)) {
        throw new EmailTakenError();
      }
    }
    const id = randomUUID();
    const record: UserRecord = {
      id,
      ...(email ? { email } : {}),
      emailVerified: input.emailVerified,
      ...(input.displayName ? { displayName: input.displayName.trim() } : {}),
      identities: [{ ...input.identity }],
      createdAt: new Date(),
    };
    this.byId.set(id, record);
    if (email) this.byEmail.set(email, id);
    this.byIdentity.set(identityKey, id);
    return { ...record };
  }

  async findByIdentity(provider: string, sub: string): Promise<UserRecord | null> {
    const id = this.byIdentity.get(identityIndexKey(provider, sub));
    if (!id) return null;
    const user = this.byId.get(id);
    return user ? { ...user } : null;
  }

  async addIdentity(userId: string, identity: UserIdentity): Promise<UserRecord | null> {
    const key = identityIndexKey(identity.provider, identity.sub);
    const existingOwner = this.byIdentity.get(key);
    if (existingOwner && existingOwner !== userId) {
      throw new IdentityTakenError();
    }
    const user = this.byId.get(userId);
    if (!user) return null;
    if (user.identities.some((i) => i.provider === identity.provider && i.sub === identity.sub)) {
      return { ...user };
    }
    if (user.identities.some((i) => i.provider === identity.provider)) {
      throw new IdentityTakenError();
    }
    const updated: UserRecord = {
      ...user,
      identities: [...user.identities, { ...identity }],
    };
    this.byId.set(userId, updated);
    this.byIdentity.set(key, userId);
    return { ...updated };
  }

  async removeIdentity(userId: string, provider: string): Promise<UserRecord | null> {
    const user = this.byId.get(userId);
    if (!user) return null;
    const target = user.identities.find((i) => i.provider === provider);
    if (!target) return null;
    const methods = (user.passwordHash ? 1 : 0) + user.identities.length;
    if (methods <= 1) {
      throw new LastSignInMethodError();
    }
    const updated: UserRecord = {
      ...user,
      identities: user.identities.filter((i) => i.provider !== provider),
    };
    this.byId.set(userId, updated);
    this.byIdentity.delete(identityIndexKey(target.provider, target.sub));
    return { ...updated };
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

  async ensureAccessUntilAtLeast(userId: string, until: Date): Promise<UserRecord | null> {
    const user = this.byId.get(userId);
    if (!user) return null;
    const current = user.accessUntil?.getTime() ?? 0;
    if (current >= until.getTime()) {
      return { ...user };
    }
    const updated: UserRecord = { ...user, accessUntil: new Date(until) };
    this.byId.set(userId, updated);
    return { ...updated };
  }

  async setEmailVerified(userId: string, emailVerified: boolean): Promise<UserRecord | null> {
    const user = this.byId.get(userId);
    if (!user) return null;
    user.emailVerified = emailVerified;
    return { ...user };
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<UserRecord | null> {
    const user = this.byId.get(userId);
    if (!user) return null;
    user.passwordHash = passwordHash;
    return { ...user };
  }

  async setPreferredModelId(userId: string, preferredModelId: string): Promise<UserRecord | null> {
    const user = this.byId.get(userId);
    if (!user) return null;
    const updated: UserRecord = { ...user, preferredModelId };
    this.byId.set(userId, updated);
    return { ...updated };
  }

  async searchByEmail(options: UserEmailSearchOptions): Promise<UserEmailSearchResult> {
    const q = options.q.trim();
    const re = new RegExp(escapeRegex(q), 'i');
    let rows = [...this.byId.values()].filter((u) => u.email && re.test(u.email));

    rows.sort((a, b) => {
      const t = b.createdAt.getTime() - a.createdAt.getTime();
      if (t !== 0) return t;
      return b.id.localeCompare(a.id);
    });

    if (options.cursor) {
      const decoded = decodeNewsCursor(options.cursor);
      if (!decoded) throw new InvalidCursorError();
      rows = rows.filter((u) => isBeforeCursor({ sortAt: u.createdAt, id: u.id }, decoded));
    }

    const limit = options.limit;
    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeNewsCursor(last.createdAt, last.id) : null;

    return { users: page.map((u) => ({ ...u })), nextCursor };
  }

  async revokeAccess(userId: string): Promise<UserRecord | null> {
    const user = this.byId.get(userId);
    if (!user) return null;
    const updated: UserRecord = { ...user };
    delete updated.accessUntil;
    this.byId.set(userId, updated);
    return { ...updated };
  }
}
