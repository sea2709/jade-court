import type { Context, Next } from 'hono';

export type AuthUser = { userId: string; clerkId?: string } | null;

/** v1: guest-only. Later: verify Clerk JWT and set userId. */
export async function authMiddleware(c: Context, next: Next) {
  c.set('user', null as AuthUser);
  await next();
}

export function getGuestId(c: Context): string {
  return c.req.header('x-guest-id') ?? 'anonymous';
}
