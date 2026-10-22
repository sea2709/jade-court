/**
 * User persistence abstraction (Mongo + in-memory for tests).
 */
import type { UserRecord } from './types.js';

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  displayName?: string;
};

export class EmailTakenError extends Error {
  readonly code = 'email_taken' as const;
  constructor() {
    super('email_taken');
  }
}

export interface UserStore {
  create(input: CreateUserInput): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  setEmailVerified(userId: string, emailVerified: boolean): Promise<UserRecord | null>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<UserRecord | null>;
}
