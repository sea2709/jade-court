/**
 * Player account API: register, login, logout, and `/api/me`.
 */
import { Hono } from 'hono';
import { readSessionCookie, clearSessionCookie } from '../auth/cookies.js';
import { isPlayerAuthEnabled } from '../auth/config.js';
import { isJsonContentType, parseAuthJsonBody } from '../auth/jsonBody.js';
import { hashEmailToken } from '../auth/emailToken.js';
import {
  clearLoginFailureAttempts,
  playerLoginEmailKey,
  playerLoginPeerEmailKey,
  beginLoginPasswordCheck,
  recordFailedLoginAtVolumeCap,
  reserveForgotPasswordAttempt,
  reserveLoginFailureAttempts,
  reserveAddEmailAttempt,
  reserveRegisterAttempt,
  reserveResendVerificationAttempt,
  reserveResetPasswordAttempt,
  reserveVerifyEmailAttempt,
} from '../auth/rateLimit.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../auth/sendAuthEmails.js';
import { createSessionForUser } from '../auth/playerSession.js';
import { hashSessionToken } from '../auth/sessionToken.js';
import { isTestEnv } from '../email/config.js';
import { getConsoleEmailOutbox } from '../email/consoleSender.js';
import type { EmailSender } from '../email/types.js';
import type { EmailTokenStore } from '../emailTokens/store.js';
import { remoteKey } from '../middleware/adminAuth.js';
import { requireUser } from '../middleware/auth.js';
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
const MAX_EMAIL_TOKEN_LEN = 512;

const FORGOT_PASSWORD_OK = {
  ok: true as const,
  message: 'check_your_email' as const,
};

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

function invalidToken(c: { json: (body: unknown, status: number) => Response }) {
  return c.json({ error: 'invalid_token' }, 401);
}

function wrongAccount(c: { json: (body: unknown, status: number) => Response }) {
  return c.json({ error: 'wrong_account' }, 403);
}

function unauthorized(c: { json: (body: unknown, status: number) => Response }) {
  return c.json({ error: 'unauthorized' }, 401);
}

export type PlayerAuthDeps = {
  userStore: UserStore;
  sessionStore: SessionStore;
  emailTokenStore: EmailTokenStore;
  emailSender: EmailSender;
};

/** Routes under `/api/auth`. */
export function createPlayerAuthRoutes(deps: PlayerAuthDeps) {
  const { userStore, sessionStore, emailTokenStore, emailSender } = deps;
  const emailDeps = { emailSender, emailTokenStore };
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
      void sendVerificationEmail(emailDeps, user).catch((err) => {
        console.warn('Failed to send verification email:', err);
      });
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

  routes.post('/verify', async (c) => {
    noStore(c);

    if (!isPlayerAuthEnabled()) {
      return authDisabled(c);
    }

    const ip = remoteKey(c);
    if (reserveVerifyEmailAttempt(ip) === 'limited') {
      return c.json({ error: 'rate_limited' }, 429);
    }

    const parsed = await parseAuthJsonBody(c);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, parsed.status);
    }
    const body = parsed.body;
    if (typeof body !== 'object' || body === null) {
      return invalidRequest(c);
    }

    const tokenRaw = (body as { token?: unknown }).token;
    if (
      typeof tokenRaw !== 'string' ||
      tokenRaw.length === 0 ||
      tokenRaw.length > MAX_EMAIL_TOKEN_LEN
    ) {
      return invalidRequest(c);
    }

    const tokenHash = hashEmailToken(tokenRaw);
    const pending = await emailTokenStore.findByTokenHash(tokenHash);
    if (!pending || pending.kind !== 'verify') {
      return invalidToken(c);
    }

    const signedIn = c.get('user');
    if (signedIn && signedIn.id !== pending.userId) {
      return wrongAccount(c);
    }

    const updated = await userStore.setEmailVerified(pending.userId, true);
    if (!updated) {
      return invalidToken(c);
    }

    const consumed = await emailTokenStore.consumeByTokenHash(tokenHash);
    if (!consumed || consumed.userId !== pending.userId) {
      return invalidToken(c);
    }

    if (!signedIn) {
      await createSessionForUser(c, updated.id, sessionStore);
    }

    return c.json({ user: toPublicUser(updated) }, 200);
  });

  routes.post('/add-email', requireUser, async (c) => {
    noStore(c);

    if (!isPlayerAuthEnabled()) {
      return authDisabled(c);
    }

    if (!isJsonContentType(c)) {
      return invalidRequest(c);
    }

    const authUser = c.get('user');
    if (!authUser) {
      return unauthorized(c);
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
    if (typeof emailRaw !== 'string') {
      return invalidRequest(c);
    }

    const email = emailRaw.trim().toLowerCase();
    if (email.length === 0 || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
      return invalidRequest(c);
    }

    const user = await userStore.findById(authUser.id);
    if (!user) {
      return unauthorized(c);
    }
    if (user.email?.trim()) {
      return c.json({ error: 'already_has_email' }, 400);
    }

    if (reserveAddEmailAttempt(authUser.id, email) === 'limited') {
      return c.json({ error: 'rate_limited' }, 429);
    }

    let updated;
    try {
      updated = await userStore.setEmail(user.id, email);
    } catch (err) {
      if (err instanceof EmailTakenError) {
        return c.json({ error: 'email_taken' }, 409);
      }
      if (err instanceof Error && err.message === 'already_has_email') {
        return c.json({ error: 'already_has_email' }, 400);
      }
      throw err;
    }
    if (!updated) {
      return invalidRequest(c);
    }

    void sendVerificationEmail(emailDeps, updated).catch((err) => {
      console.warn('Failed to send verification email:', err);
    });

    return c.json({ user: toPublicUser(updated) }, 200);
  });

  routes.post('/resend-verification', requireUser, async (c) => {
    noStore(c);

    if (!isPlayerAuthEnabled()) {
      return authDisabled(c);
    }

    const authUser = c.get('user');
    if (!authUser) {
      return unauthorized(c);
    }

    if (authUser.emailVerified) {
      return c.json({ ok: true }, 200);
    }

    if (reserveResendVerificationAttempt(authUser.id) === 'limited') {
      return c.json({ error: 'rate_limited' }, 429);
    }

    const user = await userStore.findById(authUser.id);
    if (!user?.email?.trim()) {
      return c.json({ ok: true }, 200);
    }

    void sendVerificationEmail(emailDeps, user).catch((err) => {
      console.warn('Failed to resend verification email:', err);
    });

    return c.json({ ok: true }, 200);
  });

  routes.post('/forgot-password', async (c) => {
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
    if (typeof emailRaw !== 'string') {
      return invalidRequest(c);
    }

    const email = emailRaw.trim().toLowerCase();
    if (email.length === 0 || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
      return invalidRequest(c);
    }

    const ip = remoteKey(c);
    if (reserveForgotPasswordAttempt(ip, email) === 'limited') {
      return c.json({ error: 'rate_limited' }, 429);
    }

    const user = await userStore.findByEmail(email);
    if (user?.passwordHash) {
      void sendPasswordResetEmail(emailDeps, user).catch((err) => {
        console.warn('Failed to send password reset email:', err);
      });
    }

    return c.json(FORGOT_PASSWORD_OK, 200);
  });

  routes.post('/reset-password', async (c) => {
    noStore(c);

    if (!isPlayerAuthEnabled()) {
      return authDisabled(c);
    }

    const ip = remoteKey(c);
    if (reserveResetPasswordAttempt(ip) === 'limited') {
      return c.json({ error: 'rate_limited' }, 429);
    }

    const parsed = await parseAuthJsonBody(c);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, parsed.status);
    }
    const body = parsed.body;
    if (typeof body !== 'object' || body === null) {
      return invalidRequest(c);
    }

    const tokenRaw = (body as { token?: unknown }).token;
    const passwordRaw = (body as { password?: unknown }).password;
    if (
      typeof tokenRaw !== 'string' ||
      tokenRaw.length === 0 ||
      tokenRaw.length > MAX_EMAIL_TOKEN_LEN ||
      typeof passwordRaw !== 'string' ||
      passwordRaw.length < MIN_PASSWORD_LEN ||
      passwordRaw.length > MAX_PASSWORD_LEN
    ) {
      return invalidRequest(c);
    }

    const tokenHash = hashEmailToken(tokenRaw);
    const pending = await emailTokenStore.findByTokenHash(tokenHash);
    if (!pending || pending.kind !== 'reset') {
      return invalidToken(c);
    }

    const passwordHash = await hashPassword(passwordRaw);
    const updated = await userStore.updatePasswordHash(pending.userId, passwordHash);
    if (!updated) {
      return invalidToken(c);
    }

    const consumed = await emailTokenStore.consumeByTokenHash(tokenHash);
    if (!consumed || consumed.userId !== pending.userId) {
      return invalidToken(c);
    }

    await sessionStore.deleteAllForUser(updated.id);
    await createSessionForUser(c, updated.id, sessionStore);

    return c.json({ user: toPublicUser(updated) }, 200);
  });

  if (isTestEnv()) {
    routes.get('/test-email-outbox', (c) => {
      noStore(c);
      return c.json({ messages: getConsoleEmailOutbox() }, 200);
    });
  }

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
