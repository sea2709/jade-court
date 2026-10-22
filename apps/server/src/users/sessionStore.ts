/**
 * Server-side session persistence (opaque token hash only).
 */
export type SessionRecord = {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
};

export interface SessionStore {
  create(record: SessionRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  /** Revoke every session for a user (optional keep-current for reset flow). */
  deleteAllForUser(userId: string, exceptTokenHash?: string): Promise<void>;
}
