/**
 * Player session middleware (cookie) and guest id for rooms / rate limits.
 */
import type { Context, MiddlewareHandler, Next } from 'hono';
import { isPlayerAuthEnabled } from '../auth/config.js';
import { readSessionCookie } from '../auth/cookies.js';
import { hashSessionToken } from '../auth/sessionToken.js';
import type { AppVariables } from '../types/hono.js';
import type { SessionStore } from '../users/sessionStore.js';
import type { UserStore } from '../users/store.js';
import type { UserRecord } from '../users/types.js';

/** Authenticated player attached to the request, or null for guests. */
export type AuthUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  accessUntil: Date | null;
  preferredModelId: string | null;
  createdAt: Date;
} | null;

function toAuthUser(user: UserRecord): NonNullable<AuthUser> {
  return {
    id: user.id,
    email: user.email ?? null,
    emailVerified: user.emailVerified,
    displayName: user.displayName ?? null,
    accessUntil: user.accessUntil ?? null,
    preferredModelId: user.preferredModelId ?? null,
    createdAt: user.createdAt,
  };
}

export type AuthMiddlewareDeps = {
  userStore: UserStore;
  sessionStore: SessionStore;
};

/** Load session cookie, verify against stores, and set `c.var.user`. */
export function createAuthMiddleware(
  deps: AuthMiddlewareDeps,
): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next: Next) => {
    c.set('user', null);

    if (!isPlayerAuthEnabled()) {
      await next();
      return;
    }

    const token = readSessionCookie(c);
    if (!token) {
      await next();
      return;
    }

    const tokenHash = hashSessionToken(token);
    const session = await deps.sessionStore.findByTokenHash(tokenHash);
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      await next();
      return;
    }

    const user = await deps.userStore.findById(session.userId);
    if (!user) {
      await next();
      return;
    }

    c.set('user', toAuthUser(user));
    await next();
  };
}

/** Require a signed-in player; returns 401 `{ error: 'unauthorized' }`. */
export const requireUser: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
};

export function getGuestId(c: Context): string {
  return c.req.header('x-guest-id') ?? 'anonymous';
}
