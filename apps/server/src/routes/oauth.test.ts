import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { OAUTH_COOKIE_NAME } from '../auth/oauth/stateCookie.js';
import { SESSION_COOKIE_NAME } from '../auth/config.js';
import { FAKE_OAUTH_CODE, FAKE_OAUTH_CODE_NO_EMAIL, FAKE_OAUTH_EMAIL } from '../auth/oauth/fake.js';
import { facebookDataDeletionConfirmationCode } from '../auth/oauth/dataDeletionConfirmationCode.js';
import { buildFacebookSignedRequestForTests } from '../auth/oauth/signedRequest.js';
import { setOAuthProvidersForTests } from '../auth/oauth/registry.js';
import { MemorySessionStore } from '../users/memorySessionStore.js';
import { MemoryUserStore } from '../users/memoryStore.js';
import { hashPassword } from '../users/password.js';

const SECRET = 'test-session-secret-0123456789abcdef0123456789ab';

function setupEnv() {
  process.env.SESSION_SECRET = SECRET;
  process.env.NODE_ENV = 'test';
  process.env.PUBLIC_APP_URL = 'http://localhost:5173';
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.FACEBOOK_APP_ID;
  delete process.env.FACEBOOK_APP_SECRET;
}

function oauthCookieFromResponse(res: Response): string | undefined {
  const raw = res.headers.get('set-cookie');
  if (!raw) return undefined;
  const re = new RegExp(`${OAUTH_COOKIE_NAME}=([^;]+)`);
  return raw.match(re)?.[1];
}

function sessionCookieFromResponse(res: Response): string | undefined {
  const raw = res.headers.get('set-cookie');
  if (!raw) return undefined;
  const re = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`);
  return raw.match(re)?.[1];
}

describe('oauth routes', () => {
  beforeEach(() => {
    setupEnv();
    setOAuthProvidersForTests(null);
  });

  afterEach(() => {
    setOAuthProvidersForTests(null);
  });

  function makeApp() {
    const userStore = new MemoryUserStore();
    const sessionStore = new MemorySessionStore();
    return {
      app: createApp({ newsStore: null, userStore, sessionStore }),
      userStore,
      sessionStore,
    };
  }

  it('GET /providers lists configured providers (fake in test)', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/auth/providers');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { providers: string[] };
    expect(body.providers).toContain('fake');
  });

  it('unknown provider returns 404', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/auth/unknown/start');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'provider_not_found' });
  });

  it('unconfigured google returns 503', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/auth/google/start');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'provider_unconfigured' });
  });

  it('lists facebook when FACEBOOK_APP_* is set', async () => {
    process.env.FACEBOOK_APP_ID = 'fb-id';
    process.env.FACEBOOK_APP_SECRET = 'fb-secret';
    const { app } = makeApp();
    const res = await app.request('/api/auth/providers');
    const body = (await res.json()) as { providers: string[] };
    expect(body.providers).toContain('facebook');
  });

  it('fake no-email variant creates user without email', async () => {
    const { app, userStore } = makeApp();
    const start = await app.request('/api/auth/fake/start?returnTo=/play-ai');
    const oauthCookie = oauthCookieFromResponse(start);
    const startUrl = new URL(start.headers.get('location') ?? '');
    const state = startUrl.searchParams.get('state');
    const callback = await app.request(
      `/api/auth/fake/callback?code=${FAKE_OAUTH_CODE_NO_EMAIL}&state=${state}`,
      { headers: { Cookie: `${OAUTH_COOKIE_NAME}=${oauthCookie}` } },
    );
    expect(callback.status).toBe(302);
    const users = userStore.all();
    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBeUndefined();
  });

  it('POST /facebook/data-deletion anonymizes user and returns confirmation', async () => {
    process.env.FACEBOOK_APP_ID = 'fb-id';
    process.env.FACEBOOK_APP_SECRET = 'fb-secret-for-deletion';
    const { app, userStore, sessionStore } = makeApp();
    const user = await userStore.createOAuthUser({
      email: 'fb-del@example.com',
      emailVerified: false,
      identity: { provider: 'facebook', sub: 'meta-user-99' },
    });
    await userStore.extendAccess(user.id, 60_000, new Date());
    const token = await mintSession(sessionStore, user.id);

    const signed = buildFacebookSignedRequestForTests(
      { user_id: 'meta-user-99' },
      'fb-secret-for-deletion',
    );
    const res = await app.request('/api/auth/facebook/data-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `signed_request=${encodeURIComponent(signed)}`,
    });
    expect(res.status).toBe(200);
    const expectedCode = facebookDataDeletionConfirmationCode(
      'meta-user-99',
      'fb-secret-for-deletion',
    );
    const body = (await res.json()) as { url: string; confirmation_code: string };
    expect(body.confirmation_code).toBe(expectedCode);
    expect(body.url).toBe(`http://localhost:5173/account/data-deletion?code=${expectedCode}`);

    const status = await app.request(`/api/auth/data-deletion-status?code=${expectedCode}`);
    expect(status.status).toBe(200);
    const statusBody = (await status.json()) as { status: string; deletedAt: string };
    expect(statusBody.status).toBe('completed');
    expect(statusBody.deletedAt).toBeTruthy();

    const updated = await userStore.findById(user.id);
    expect(updated?.email).toBeUndefined();
    expect(updated?.identities).toEqual([]);
    expect(updated?.accessUntil).toBeUndefined();

    const me = await app.request('/api/me', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { user: unknown };
    expect(meBody.user).toBeNull();
  });

  it('POST /facebook/data-deletion rejects invalid signed_request', async () => {
    process.env.FACEBOOK_APP_ID = 'fb-id';
    process.env.FACEBOOK_APP_SECRET = 'fb-secret-for-deletion';
    const { app } = makeApp();
    const res = await app.request('/api/auth/facebook/data-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'signed_request=not.valid',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_signed_request' });
  });

  it('rejects state mismatch on callback', async () => {
    const { app } = makeApp();
    const start = await app.request('/api/auth/fake/start?returnTo=/play-ai');
    const oauthCookie = oauthCookieFromResponse(start);
    expect(oauthCookie).toBeDefined();
    const callback = await app.request(
      `/api/auth/fake/callback?code=${FAKE_OAUTH_CODE}&state=wrong-state`,
      {
        headers: { Cookie: `${OAUTH_COOKIE_NAME}=${oauthCookie}` },
      },
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe(
      'http://localhost:5173/play-ai?oauth_error=state_mismatch',
    );
  });

  it('fake provider signs in and sets session cookie', async () => {
    const { app, userStore } = makeApp();
    const start = await app.request('/api/auth/fake/start?returnTo=/account');
    const oauthCookie = oauthCookieFromResponse(start);
    const startUrl = new URL(start.headers.get('location') ?? '');
    const state = startUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    const callback = await app.request(
      `/api/auth/fake/callback?code=${FAKE_OAUTH_CODE}&state=${state}`,
      { headers: { Cookie: `${OAUTH_COOKIE_NAME}=${oauthCookie}` } },
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('http://localhost:5173/account');
    const session = sessionCookieFromResponse(callback);
    expect(session).toBeDefined();

    const users = userStore.all();
    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe(FAKE_OAUTH_EMAIL);

    const me = await app.request('/api/me', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${session}` },
    });
    const meBody = (await me.json()) as { user: { email: string } | null };
    expect(meBody.user?.email).toBe(FAKE_OAUTH_EMAIL);
  });

  it('GET /identities returns password and linked providers', async () => {
    const { app, userStore, sessionStore } = makeApp();
    const passwordHash = await hashPassword('password123');
    const user = await storeWithPasswordAndFake(userStore, passwordHash);
    if (!user) throw new Error('user missing');
    const token = await mintSession(sessionStore, user.id);

    const res = await app.request('/api/auth/identities', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hasPassword: true, providers: ['fake'] });
  });

  it('DELETE identity blocks unlinking last sign-in method', async () => {
    const { app, userStore, sessionStore } = makeApp();
    const user = await userStore.createOAuthUser({
      email: 'only-oauth@example.com',
      emailVerified: true,
      identity: { provider: 'fake', sub: 'only' },
    });
    const token = await mintSession(sessionStore, user.id);

    const del = await app.request('/api/auth/identities/fake', {
      method: 'DELETE',
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(del.status).toBe(400);
    expect(await del.json()).toEqual({ error: 'last_sign_in_method' });
  });

  it('allows unlink when password remains', async () => {
    const { app, userStore, sessionStore } = makeApp();
    const passwordHash = await hashPassword('password123');
    const user = await storeWithPasswordAndFake(userStore, passwordHash);
    if (!user) throw new Error('user missing');
    const token = await mintSession(sessionStore, user.id);

    const del = await app.request('/api/auth/identities/fake', {
      method: 'DELETE',
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(del.status).toBe(200);
    const updated = await userStore.findById(user.id);
    expect(updated?.identities).toHaveLength(0);
  });
});

async function storeWithPasswordAndFake(userStore: MemoryUserStore, passwordHash: string) {
  const user = await userStore.create({
    email: 'both@example.com',
    passwordHash,
    displayName: 'Both',
  });
  await userStore.addIdentity(user.id, { provider: 'fake', sub: 'fake-sub' });
  return userStore.findById(user.id);
}

async function mintSession(sessionStore: MemorySessionStore, userId: string) {
  const { generateSessionToken, hashSessionToken } = await import('../auth/sessionToken.js');
  const { newSessionExpiresAt } = await import('../auth/cookies.js');
  const token = generateSessionToken();
  await sessionStore.create({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: newSessionExpiresAt(),
  });
  return token;
}
