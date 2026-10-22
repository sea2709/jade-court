/**
 * Require a signed-in player with an active day pass for Learn LLM routes.
 */
import type { MiddlewareHandler } from 'hono';
import { hasPlayAccess } from '../billing/access.js';
import type { AppVariables } from '../types/hono.js';
/** Block guests and expired passes before LLM handlers or rate limits run. */
export const requirePlayAccess: MiddlewareHandler<{ Variables: AppVariables }> = async (
  c,
  next,
) => {
  const user = c.get('user');
  if (!user) {
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'auth_required' }, 401);
  }
  const now = new Date();
  if (!hasPlayAccess(user, now)) {
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'access_required' }, 402);
  }
  await next();
};
