/**
 * Per-user rate limit for gated LLM routes (after `requirePlayAccess`).
 */
import type { MiddlewareHandler } from 'hono';
import { checkRateLimit } from '../llm/rateLimit.js';
import type { AppVariables } from '../types/hono.js';

/** 30 requests per minute per signed-in user id. */
export const llmUserRateLimit: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const user = c.get('user');
  const key = user ? `user:${user.id}` : 'user:anonymous';
  if (!checkRateLimit(key)) {
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'rate_limit_exceeded' }, 429);
  }
  await next();
};
