/**
 * Single-use email action tokens (verification, password reset).
 */

export type EmailTokenKind = 'verify' | 'reset';

export type EmailTokenRecord = {
  tokenHash: string;
  userId: string;
  kind: EmailTokenKind;
  expiresAt: Date;
};

export interface EmailTokenStore {
  create(record: EmailTokenRecord): Promise<void>;
  /** Lookup without consuming (for auth checks before delete). */
  findByTokenHash(tokenHash: string, now?: Date): Promise<EmailTokenRecord | null>;
  /** Remove and return the row when present and not expired (single-use). */
  consumeByTokenHash(tokenHash: string, now?: Date): Promise<EmailTokenRecord | null>;
  deleteByUserIdAndKind(userId: string, kind: EmailTokenKind): Promise<void>;
}
