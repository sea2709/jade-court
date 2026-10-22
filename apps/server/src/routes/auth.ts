/**
 * Player account API: register, login, logout, and `/api/me`.
 */
import { Hono } from 'hono';
import {
  readSessionCookie,
  clearSessionCookie,
  newSessionExpiresAt,
  setSessionCookie,
} from '../auth/cookies.js';
import { isPlayerAuthEnabled } from '../auth/config.js';
import { isJsonContentType, parseAuthJsonBody } from '../auth/jsonBody.js';
import {
  clearLoginFailureAttempts,
  playerLoginEmailKey,
  playerLoginPeerEmailKey,
  beginLoginPasswordCheck,
  recordFailedLoginAtVolumeCap,
  reserveLoginFailureAttempts,
  reserveRegisterAttempt,
} from '../auth/rateLimit.js';
import { generateSessionToken, hashSessionToken } from '../auth/sessionToken.js';
import { remoteKey } from '../middleware/adminAuth.js';
import type { AppVariables } from '../types/hono.js';
import { hashPassword, verifyLoginPassword } from '../users/password.js';
import type { SessionStore } from '../users/sessionStore.js';
import { EmailTakenError, type UserStore } from '../users/store.js';
import { accessInfo, toPublicUser } from '../users/types.js';

const MAX_EMAIL_LEN = 320;
const MAX_PASSWORD_LEN = 1024;
const MIN_PASSWORD_LEN = 8;
const MAX_DISPLAY_NAME_LEN = 64;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function noStore(c: { header: (name: string, value: string) => void }) {
  c.header('Cache-Control', 'no-store');
}

function invalidRequest(c: { json: (body: unknown, status: number) => Response }) {
  return c.json({ error: 'invalid_request' }, 400);
}

function invalidCredentials(c: { json: (body: unknown, status: number) => Response }) {
  return c.json({ error: 'invalid_credentials' }, 401);
}

function authDisabled(c: { json: (body: unknown, status: number) => Response }) {
  return c.json({ error: 'auth_disabled' }, 503);
}

async function createSessionForUser(
  c: { header: (name: string, value: string) => void },
  userId: string,
  sessionStore: SessionStore,
): Promise<void> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = newSessionExpiresAt();
  await sessionStore.create({ tokenHash, userId, expiresAt });
  setSessionCookie(c as Parameters<typeof setSessionCookie>[0], token, expiresAt);
}

export type PlayerAuthDeps = {
  userStore: UserStore;
  sessionStore: SessionStore;
};

/** Routes under `/api/auth`. */
export function createPlayerAuthRoutes(deps: PlayerAuthDeps) {
  const { userStore, sessionStore } = deps;
  const routes = new Hono<{ Variables: AppVariables }>();

  routes.post('/register', async (c) => {
    noStore(c);

    if (!isPlayerAuthEnabled()) {
      return authDisabled(c);
    }

    const parsed = await parseAuthJsonBody(c);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, parsed.status);
    }
    const body = parsed.body;

    if (typeof body !== 'object' || body === null) {
      return invalidRequest(c);
    }

    const emailRaw = (body as { email?: unknown }).email;
    const passwordRaw = (body as { password?: unknown }).password;
    const displayNameRaw = (body as { displayName?: unknown }).displayName;

    if (
      typeof emailRaw !== 'string' ||
      typeof passwordRaw !== 'string' ||
      typeof displayNameRaw !== 'string'
    ) {
      return invalidRequest(c);
    }

    const email = emailRaw.trim().toLowerCase();
    const password = passwordRaw;
    const displayName = displayNameRaw.trim();

    if (
      email.length === 0 ||
      email.length > MAX_EMAIL_LEN ||
      !EMAIL_RE.test(email) ||
      password.length < MIN_PASSWORD_LEN ||
      password.length > MAX_PASSWORD_LEN ||
      displayName.length === 0 ||
      displayName.length > MAX_DISPLAY_NAME_LEN
    ) {
      return invalidRequest(c);
    }

    if (reserveRegisterAttempt() === 'limited') {
      return c.json({ error: 'rate_limited' }, 429);
    }

    const passwordHash = await hashPassword(password);

    try {
      const user = await userStore.create({ email, passwordHash, displayName });
      await createSessionForUser(c, user.id, sessionStore);
      return c.json({ user: toPublicUser(user) }, 201);
    } catch (err) {
      if (err instanceof EmailTakenError) {
        return c.json({ error: 'email_taken' }, 409);
      }
      throw err;
    }
  });

  routes.post('/login', async (c) => {
    noStore(c);

    if (!isPlayerAuthEnabled()) {
      return authDisabled(c);
    }

    const parsed = await parseAuthJsonBody(c);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, parsed.status);
    }
    const body = parsed.body;

    if (typeof body !== 'object' || body === null) {
      return invalidRequest(c);
    }

    const emailRaw = (body as { email?: unknown }).email;
    const passwordRaw = (body as { password?: unknown }).password;

    if (typeof emailRaw !== 'string' || typeof passwordRaw !== 'string') {
      return invalidRequest(c);
    }

    const email = emailRaw.trim().toLowerCase();
    const password = passwordRaw;

    if (
      email.length === 0 ||
      email.length > MAX_EMAIL_LEN ||
      password.length === 0 ||
      password.length > MAX_PASSWORD_LEN
    ) {
      return invalidRequest(c);
    }

    const ip = remoteKey(c);
    const emailKey = playerLoginEmailKey(email);
    const peerEmailKey = playerLoginPeerEmailKey(ip, email);

    if (reserveLoginFailureAttempts([emailKey, peerEmailKey]) === 'limited') {
      return c.json({ error: 'rate_limited' }, 429);
    }

    const volumeGuard = beginLoginPasswordCheck();
    if (volumeGuard === 'limited') {
      return c.json({ error: 'rate_limited' }, 429);
    }

    const user = await userStore.findByEmail(email);
    const passwordOk = await verifyLoginPassword(password, user?.passwordHash);

    if (!user || !passwordOk) {
      if (volumeGuard.kind === 'at_cap' && recordFailedLoginAtVolumeCap() === 'limited') {
        return c.json({ error: 'rate_limited' }, 429);
      }
      return invalidCredentials(c);
    }

    if (volumeGuard.kind === 'below_cap') {
      volumeGuard.rollback();
    }
    clearLoginFailureAttempts(emailKey, peerEmailKey);
    await createSessionForUser(c, user.id, sessionStore);
    return c.json({ user: toPublicUser(user) }, 200);
  });

  routes.post('/logout', async (c) => {
    noStore(c);

    if (!isJsonContentType(c)) {
      return invalidRequest(c);
    }

    const token = readSessionCookie(c);
    if (token) {
      const tokenHash = hashSessionToken(token);
      let revoked = true;
      try {
        await sessionStore.deleteByTokenHash(tokenHash);
      } catch {
        revoked = false;
      }
      clearSessionCookie(c);
      if (!revoked) {
        return c.json({ error: 'logout_failed' }, 500);
      }
    }
    return c.json({ ok: true }, 200);
  });

  return routes;
}

/** `GET /api/me` — works signed in or out. */
export function createMeRoute() {
  const routes = new Hono<{ Variables: AppVariables }>();

  routes.get('/me', (c) => {
    noStore(c);
    const authUser = c.get('user');
    if (!authUser) {
      return c.json({
        user: null,
        access: { active: false, accessUntil: null },
      });
    }
    const record = {
      id: authUser.id,
      email: authUser.email ?? undefined,
      emailVerified: authUser.emailVerified,
      displayName: authUser.displayName ?? undefined,
      identities: [] as { provider: string; sub: string }[],
      accessUntil: authUser.accessUntil ?? undefined,
      preferredModelId: authUser.preferredModelId ?? undefined,
      createdAt: authUser.createdAt,
    };
    return c.json({
      user: toPublicUser(record),
      access: accessInfo(record),
    });
  });

  return routes;
}
