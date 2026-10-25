/**
 * OAuth sign-in, callback, provider list, and identity link/unlink.
 */
import { Hono } from 'hono';
import { isPlayerAuthEnabled } from '../auth/config.js';
import { createSessionForUser } from '../auth/playerSession.js';
import { codeChallengeS256, generateCodeVerifier } from '../auth/oauth/pkce.js';
import { linkOAuthToUser, resolveOAuthUser, signInMethodCount } from '../auth/oauth/linking.js';
import { normalizeReturnTo } from '../auth/oauth/returnTo.js';
import {
  clearOAuthCookie,
  newOAuthState,
  readOAuthCookie,
  setOAuthCookie,
} from '../auth/oauth/stateCookie.js';
import {
  getOAuthProvider,
  isKnownOAuthProvider,
  listConfiguredOAuthProviders,
  type OAuthRegistryDeps,
} from '../auth/oauth/registry.js';
import { LastSignInMethodError } from '../users/store.js';
import { requireUser } from '../middleware/auth.js';
import type { AppVariables } from '../types/hono.js';
import type { SessionStore } from '../users/sessionStore.js';
import type { UserStore } from '../users/store.js';
import { appBaseUrl } from '../auth/oauth/config.js';
import { handleFacebookDataDeletion } from '../auth/oauth/facebookDataDeletion.js';
import type { DataDeletionStore } from '../auth/oauth/dataDeletionStore.js';
import type { EmailTokenStore } from '../emailTokens/store.js';

const DATA_DELETION_CODE_RE = /^[a-f0-9]{32}$/i;

function noStore(c: { header: (name: string, value: string) => void }) {
  c.header('Cache-Control', 'no-store');
}

function authDisabled(c: { json: (body: unknown, status: number) => Response }) {
  return c.json({ error: 'auth_disabled' }, 503);
}

function redirectWithOAuthError(returnTo: string, code: string): Response {
  const base = appBaseUrl();
  const path = returnTo.startsWith('/') ? returnTo : '/';
  const url = new URL(path, base);
  url.searchParams.set('oauth_error', code);
  return Response.redirect(url.toString(), 302);
}

export type OAuthRouteDeps = {
  userStore: UserStore;
  sessionStore: SessionStore;
  dataDeletionStore: DataDeletionStore;
  emailTokenStore?: EmailTokenStore;
  registry?: OAuthRegistryDeps;
};

/** Routes mounted under `/api/auth` (register static paths before `/:provider/*`). */
export function createOAuthRoutes(deps: OAuthRouteDeps) {
  const { userStore, sessionStore, dataDeletionStore, emailTokenStore, registry } = deps;
  const routes = new Hono<{ Variables: AppVariables }>();

  routes.get('/data-deletion-status', async (c) => {
    noStore(c);
    const raw = c.req.query('code')?.trim() ?? '';
    if (!DATA_DELETION_CODE_RE.test(raw)) {
      return c.json({ error: 'invalid_code' }, 400);
    }
    const record = await dataDeletionStore.findByConfirmationCode(raw);
    if (!record) {
      return c.json({ error: 'not_found' }, 404);
    }
    return c.json({
      status: 'completed' as const,
      deletedAt: record.deletedAt.toISOString(),
    });
  });

  routes.post('/facebook/data-deletion', async (c) => {
    noStore(c);
    let signedRequest: string | undefined;
    const contentType = c.req.header('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = (await c.req.json().catch(() => null)) as { signed_request?: string } | null;
      signedRequest = body?.signed_request;
    } else {
      const body = await c.req.parseBody();
      const raw = body['signed_request'];
      signedRequest = typeof raw === 'string' ? raw : undefined;
    }
    const result = await handleFacebookDataDeletion(signedRequest, {
      userStore,
      sessionStore,
      dataDeletionStore,
      emailTokenStore,
    });
    if (!result.ok) {
      if (result.error === 'not_configured') {
        return c.json({ error: 'facebook_not_configured' }, 503);
      }
      return c.json({ error: result.error }, 400);
    }
    return c.json({ url: result.url, confirmation_code: result.confirmation_code });
  });

  routes.get('/providers', (c) => {
    noStore(c);
    if (!isPlayerAuthEnabled()) {
      return authDisabled(c);
    }
    return c.json({ providers: listConfiguredOAuthProviders(registry) });
  });

  routes.get('/identities', requireUser, async (c) => {
    noStore(c);
    if (!isPlayerAuthEnabled()) {
      return authDisabled(c);
    }
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const record = await userStore.findById(user.id);
    if (!record) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    return c.json({
      hasPassword: Boolean(record.passwordHash),
      providers: record.identities.map((i) => i.provider),
    });
  });

  routes.post('/identities/:provider/link', requireUser, async (c) => {
    noStore(c);
    if (!isPlayerAuthEnabled()) {
      return authDisabled(c);
    }
    const providerId = c.req.param('provider');
    if (!isKnownOAuthProvider(providerId, registry)) {
      return c.json({ error: 'provider_not_found' }, 404);
    }
    const provider = getOAuthProvider(providerId, registry);
    if (!provider || !provider.isConfigured()) {
      return c.json({ error: 'provider_unconfigured' }, 503);
    }
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const returnTo = normalizeReturnTo(c.req.query('returnTo'));
    const state = newOAuthState();
    const verifier = generateCodeVerifier();
    const challenge = codeChallengeS256(verifier);
    setOAuthCookie(c, {
      state,
      verifier,
      returnTo,
      mode: 'link',
      linkUserId: user.id,
    });
    const url = provider.authorizeUrl(state, challenge);
    return c.redirect(url, 302);
  });

  routes.delete('/identities/:provider', requireUser, async (c) => {
    noStore(c);
    if (!isPlayerAuthEnabled()) {
      return authDisabled(c);
    }
    const providerId = c.req.param('provider');
    if (!isKnownOAuthProvider(providerId, registry)) {
      return c.json({ error: 'provider_not_found' }, 404);
    }
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const record = await userStore.findById(user.id);
    if (!record) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    if (signInMethodCount(record) <= 1) {
      return c.json({ error: 'last_sign_in_method' }, 400);
    }
    try {
      const updated = await userStore.removeIdentity(user.id, providerId);
      if (!updated) {
        return c.json({ error: 'not_linked' }, 404);
      }
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof LastSignInMethodError) {
        return c.json({ error: 'last_sign_in_method' }, 400);
      }
      throw err;
    }
  });

  routes.get('/:provider/start', async (c) => {
    noStore(c);
    if (!isPlayerAuthEnabled()) {
      return authDisabled(c);
    }
    const providerId = c.req.param('provider');
    if (!isKnownOAuthProvider(providerId, registry)) {
      return c.json({ error: 'provider_not_found' }, 404);
    }
    const provider = getOAuthProvider(providerId, registry);
    if (!provider || !provider.isConfigured()) {
      return c.json({ error: 'provider_unconfigured' }, 503);
    }
    const returnTo = normalizeReturnTo(c.req.query('returnTo'));
    const state = newOAuthState();
    const verifier = generateCodeVerifier();
    const challenge = codeChallengeS256(verifier);
    setOAuthCookie(c, {
      state,
      verifier,
      returnTo,
      mode: 'signin',
    });
    const url = provider.authorizeUrl(state, challenge);
    return c.redirect(url, 302);
  });

  routes.get('/:provider/callback', async (c) => {
    noStore(c);
    if (!isPlayerAuthEnabled()) {
      return authDisabled(c);
    }
    const providerId = c.req.param('provider');
    if (!isKnownOAuthProvider(providerId, registry)) {
      return c.json({ error: 'provider_not_found' }, 404);
    }
    const provider = getOAuthProvider(providerId, registry);
    if (!provider || !provider.isConfigured()) {
      return c.json({ error: 'provider_unconfigured' }, 503);
    }

    const cookie = readOAuthCookie(c);
    clearOAuthCookie(c);
    const returnTo = cookie?.returnTo ?? '/';
    if (!cookie) {
      return redirectWithOAuthError(returnTo, 'oauth_state_missing');
    }

    const stateParam = c.req.query('state');
    if (!stateParam || stateParam !== cookie.state) {
      return redirectWithOAuthError(returnTo, 'state_mismatch');
    }

    const code = c.req.query('code');
    if (!code || typeof code !== 'string') {
      return redirectWithOAuthError(returnTo, 'missing_code');
    }

    let profile;
    try {
      profile = await provider.exchange(code, cookie.verifier);
    } catch {
      return redirectWithOAuthError(returnTo, 'exchange_failed');
    }

    let userId: string;
    if (cookie.mode === 'link' && cookie.linkUserId) {
      const result = await linkOAuthToUser(userStore, cookie.linkUserId, providerId, profile);
      if (!result.ok) {
        const err =
          result.error === 'identity_taken'
            ? 'identity_taken'
            : result.error === 'link_user_missing'
              ? 'link_failed'
              : 'link_failed';
        return redirectWithOAuthError(returnTo, err);
      }
      userId = result.user.id;
    } else {
      const result = await resolveOAuthUser(userStore, providerId, profile);
      if (!result.ok) {
        const err =
          result.error === 'identity_taken'
            ? 'identity_taken'
            : result.error === 'email_exists_use_link'
              ? 'email_exists_use_link'
              : result.error === 'email_taken'
                ? 'email_taken'
                : 'link_failed';
        return redirectWithOAuthError(returnTo, err);
      }
      userId = result.user.id;
    }

    await createSessionForUser(c, userId, sessionStore);

    const base = appBaseUrl();
    const path = returnTo.startsWith('/') ? returnTo : '/';
    const url = new URL(path, base);
    return c.redirect(url.toString(), 302);
  });

  return routes;
}
