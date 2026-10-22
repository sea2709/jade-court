/**
 * Breadcrumb trail entries: public top-nav routes plus account (not in topbar nav).
 */
import { PUBLIC_NAV } from './publicNav';

export const BREADCRUMB_NAV = [
  ...PUBLIC_NAV,
  ['/login', 'Sign in'],
  ['/register', 'Create account'],
  ['/register/sent', 'Check your inbox'],
  ['/verify-email', 'Verify email'],
  ['/forgot-password', 'Forgot password'],
  ['/reset-password', 'Reset password'],
  ['/account', 'Account'],
] as const;
