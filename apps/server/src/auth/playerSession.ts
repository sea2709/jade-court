/**
 * Mint a player session cookie after register, login, or OAuth.
 */
import type { Context } from 'hono';
import { newSessionExpiresAt, setSessionCookie } from './cookies.js';
import { generateSessionToken, hashSessionToken } from './sessionToken.js';
import type { SessionStore } from '../users/sessionStore.js';

export async function createSessionForUser(
  c: { header: (name: string, value: string) => void },
  userId: string,
  sessionStore: SessionStore,
): Promise<void> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = newSessionExpiresAt();
  await sessionStore.create({ tokenHash, userId, expiresAt });
  setSessionCookie(c as Context, token, expiresAt);
}
