/**
 * Admin session API: login (public) and current user (`/me`).
 */
import { Hono } from 'hono';
import { createSessionToken } from '../admin/session.js';
import { isAdminEnabled, verifyAdminCredentials } from '../admin/users.js';
import { revokeAccess, extendAccess } from '../billing/access.js';
import { MAX_PLAY_AI_ACCESS_HOURS, playAiAccessHours } from '../billing/config.js';
import type { PaymentStore } from '../billing/payments/store.js';
import { toAdminPaymentRow, toPublicPayment } from '../billing/payments/types.js';
import {
  adminAuth,
  adminLoginRateLimitKey,
  clearFailures,
  isRateLimited,
  recordFailure,
  remoteKey,
} from '../middleware/adminAuth.js';
import { InvalidCursorError } from '../news/memoryStore.js';
import type { AppVariables } from '../types/hono.js';
import { isUuid } from '../users/id.js';
import type { UserStore } from '../users/store.js';
import { accessInfo, toAdminUserSummary, toPublicUser } from '../users/types.js';

const MAX_USERNAME_LEN = 128;
const MAX_PASSWORD_LEN = 1024;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;
const MAX_USER_PAYMENTS = 20;
const MAX_USER_SEARCH_Q_LEN = 256;

export type CreateAdminRoutesDeps = {
  userStore: UserStore;
  paymentStore: PaymentStore;
};

function noStore(c: { header: (name: string, value: string) => void }) {
  c.header('Cache-Control', 'no-store');
}

function invalidCredentials(c: { json: (body: unknown, status: number) => Response }) {
  return c.json({ error: 'invalid_credentials' }, 401);
}

function parseListLimit(raw: string | undefined): number {
  let limit = Number(raw ?? DEFAULT_LIST_LIMIT);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIST_LIMIT;
  if (limit > MAX_LIST_LIMIT) limit = MAX_LIST_LIMIT;
  return limit;
}

/** Routes under `/api/admin` (login is public; protected routes use `adminAuth` per route). */
export function createAdminRoutes(deps: CreateAdminRoutesDeps) {
  const routes = new Hono<{ Variables: AppVariables }>();
  const { userStore, paymentStore } = deps;

  routes.post('/login', async (c) => {
    noStore(c);

    if (!isAdminEnabled()) {
      return c.json({ error: 'admin_disabled' }, 503);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_request' }, 400);
    }

    if (typeof body !== 'object' || body === null) {
      return c.json({ error: 'invalid_request' }, 400);
    }

    const usernameRaw = (body as { username?: unknown }).username;
    const passwordRaw = (body as { password?: unknown }).password;

    if (typeof usernameRaw !== 'string' || typeof passwordRaw !== 'string') {
      return c.json({ error: 'invalid_request' }, 400);
    }

    if (usernameRaw.length > MAX_USERNAME_LEN || passwordRaw.length > MAX_PASSWORD_LEN) {
      return c.json({ error: 'invalid_request' }, 400);
    }

    const username = usernameRaw;
    const password = passwordRaw;

    const limitKey = adminLoginRateLimitKey(remoteKey(c), username);
    if (isRateLimited(limitKey)) {
      return c.json({ error: 'rate_limited' }, 429);
    }

    const valid = verifyAdminCredentials(username, password);
    if (!valid) {
      const limited = recordFailure(limitKey);
      if (limited) {
        return c.json({ error: 'rate_limited' }, 429);
      }
      return invalidCredentials(c);
    }

    clearFailures(limitKey);
    const { token, expiresAt } = createSessionToken(username);
    return c.json({ token, username, expiresAt }, 200);
  });

  routes.get('/me', adminAuth, (c) => {
    noStore(c);
    return c.json({ username: c.get('adminUser') }, 200);
  });

  routes.get('/users', adminAuth, async (c) => {
    noStore(c);
    const qRaw = c.req.query('q');
    const q = typeof qRaw === 'string' ? qRaw.trim() : '';
    if (!q || q.length > MAX_USER_SEARCH_Q_LEN) {
      return c.json({ error: 'invalid_query' }, 400);
    }
    const limit = parseListLimit(c.req.query('limit'));
    const cursor = c.req.query('cursor') || undefined;

    try {
      const result = await userStore.searchByEmail({ q, limit, cursor });
      let users = result.users.map(toAdminUserSummary);
      if (!cursor && isUuid(q)) {
        const direct = await userStore.findById(q);
        if (direct && !users.some((u) => u.id === direct.id)) {
          users = [toAdminUserSummary(direct), ...users];
        }
      }
      return c.json(
        {
          users,
          nextCursor: result.nextCursor,
        },
        200,
      );
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        return c.json({ error: 'invalid_cursor' }, 400);
      }
      throw err;
    }
  });

  routes.get('/users/:id', adminAuth, async (c) => {
    noStore(c);
    const userId = c.req.param('id');
    const user = await userStore.findById(userId);
    if (!user) {
      return c.json({ error: 'user_not_found' }, 404);
    }
    const payments = (await paymentStore.listByUserId(userId, { limit: MAX_USER_PAYMENTS })).map(
      toPublicPayment,
    );
    return c.json(
      {
        user: toPublicUser(user),
        identities: user.identities,
        access: accessInfo(user),
        payments,
      },
      200,
    );
  });

  routes.get('/payments', adminAuth, async (c) => {
    noStore(c);
    const limit = parseListLimit(c.req.query('limit'));
    const cursor = c.req.query('cursor') || undefined;

    try {
      const result = await paymentStore.listRecent({ limit, cursor });
      const userIds = [...new Set(result.payments.map((p) => p.userId))];
      const emailByUserId = new Map<string, string | null>();
      await Promise.all(
        userIds.map(async (id) => {
          const u = await userStore.findById(id);
          emailByUserId.set(id, u?.email ?? null);
        }),
      );
      const payments = result.payments.map((p) =>
        toAdminPaymentRow(p, emailByUserId.get(p.userId)),
      );
      return c.json({ payments, nextCursor: result.nextCursor }, 200);
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        return c.json({ error: 'invalid_cursor' }, 400);
      }
      throw err;
    }
  });

  routes.post('/users/:id/grant', adminAuth, async (c) => {
    noStore(c);

    let body: unknown = {};
    const raw = await c.req.text();
    if (raw.trim() !== '') {
      try {
        body = JSON.parse(raw);
      } catch {
        return c.json({ error: 'invalid_request' }, 400);
      }
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ error: 'invalid_request' }, 400);
    }

    const hoursRaw = (body as { hours?: unknown }).hours;
    let hours = playAiAccessHours();
    if (hoursRaw !== undefined) {
      if (typeof hoursRaw !== 'number' || !Number.isFinite(hoursRaw) || hoursRaw <= 0) {
        return c.json({ error: 'invalid_request' }, 400);
      }
      if (hoursRaw > MAX_PLAY_AI_ACCESS_HOURS) {
        return c.json({ error: 'invalid_request' }, 400);
      }
      hours = hoursRaw;
    }

    const userId = c.req.param('id');
    const updated = await extendAccess(userStore, userId, hours, new Date());
    if (!updated) {
      return c.json({ error: 'user_not_found' }, 404);
    }

    return c.json(
      {
        user: toPublicUser(updated),
        access: accessInfo(updated),
      },
      200,
    );
  });

  routes.post('/users/:id/revoke', adminAuth, async (c) => {
    noStore(c);
    const userId = c.req.param('id');
    const updated = await revokeAccess(userStore, userId);
    if (!updated) {
      return c.json({ error: 'user_not_found' }, 404);
    }
    return c.json(
      {
        user: toPublicUser(updated),
        access: accessInfo(updated),
      },
      200,
    );
  });

  return routes;
}
