/**
 * User persistence abstraction (Mongo + in-memory for tests).
 */
import type { UserIdentity, UserRecord } from './types.js';

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  displayName?: string;
};

export type CreateOAuthUserInput = {
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  identity: UserIdentity;
};

export class EmailTakenError extends Error {
  readonly code = 'email_taken' as const;
  constructor() {
    super('email_taken');
  }
}

export class IdentityTakenError extends Error {
  readonly code = 'identity_taken' as const;
  constructor() {
    super('identity_taken');
  }
}

export class LastSignInMethodError extends Error {
  readonly code = 'last_sign_in_method' as const;
  constructor() {
    super('last_sign_in_method');
  }
}

export type UserEmailSearchOptions = {
  q: string;
  limit: number;
  cursor?: string;
};

export type UserEmailSearchResult = {
  users: UserRecord[];
  nextCursor: string | null;
};

export interface UserStore {
  create(input: CreateUserInput): Promise<UserRecord>;
  createOAuthUser(input: CreateOAuthUserInput): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  findByIdentity(provider: string, sub: string): Promise<UserRecord | null>;
  addIdentity(userId: string, identity: UserIdentity): Promise<UserRecord | null>;
  removeIdentity(userId: string, provider: string): Promise<UserRecord | null>;
  /** Atomically extend `accessUntil` by `ms` from max(now, current access). */
  extendAccess(userId: string, ms: number, now: Date): Promise<UserRecord | null>;
  /** Raise `accessUntil` to at least `until` without shortening existing access. */
  ensureAccessUntilAtLeast(userId: string, until: Date): Promise<UserRecord | null>;
  setEmailVerified(userId: string, emailVerified: boolean): Promise<UserRecord | null>;
  /** Set email on an account that has none yet (OAuth without email). */
  setEmail(userId: string, email: string): Promise<UserRecord | null>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<UserRecord | null>;
  setPreferredModelId(userId: string, preferredModelId: string): Promise<UserRecord | null>;
  /** Remove PII and OAuth identities (e.g. Meta data-deletion). Returns false if user missing. */
  anonymizeUser(userId: string): Promise<boolean>;
  /** Case-insensitive email substring search, newest `createdAt` first. */
  searchByEmail(options: UserEmailSearchOptions): Promise<UserEmailSearchResult>;
  /** Clears play access (`accessUntil` removed). */
  revokeAccess(userId: string): Promise<UserRecord | null>;
}
