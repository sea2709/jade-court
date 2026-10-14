/**
 * Admin session API: login (public) and current user (`/me`).
 */
import { Hono } from 'hono';
import { createSessionToken } from '../admin/session.js';
import { isAdminEnabled, verifyAdminCredentials } from '../admin/users.js';
import {
  adminAuth,
  adminLoginRateLimitKey,
  clearFailures,
  isRateLimited,
  recordFailure,
  remoteKey,
} from '../middleware/adminAuth.js';
import type { AppVariables } from '../types/hono.js';

const MAX_USERNAME_LEN = 128;
const MAX_PASSWORD_LEN = 1024;

function noStore(c: { header: (name: string, value: string) => void }) {
  c.header('Cache-Control', 'no-store');
}

function invalidCredentials(c: { json: (body: unknown, status: number) => Response }) {
  return c.json({ error: 'invalid_credentials' }, 401);
}

/** Routes under `/api/admin` (login is public; `/me` uses `adminAuth` per route). */
export function createAdminRoutes() {
  const routes = new Hono<{ Variables: AppVariables }>();

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

  return routes;
}
