import type { AuthUser } from '../middleware/auth.js';

/** Hono context variables shared across admin routes and middleware. */
export type AppVariables = {
  adminUser: string;
  user: AuthUser;
};
