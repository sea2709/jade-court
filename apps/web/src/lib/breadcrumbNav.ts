/**
 * Breadcrumb trail entries: public top-nav routes plus account (not in topbar nav).
 */
import { authModeFromSearch } from './authScreenMode';
import { PUBLIC_NAV } from './publicNav';

export const BREADCRUMB_NAV = [
  ...PUBLIC_NAV,
  ['/login', 'Sign in'],
  ['/register/sent', 'Check your inbox'],
  ['/verify-email', 'Verify email'],
  ['/forgot-password', 'Forgot password'],
  ['/reset-password', 'Reset password'],
  ['/account', 'Account'],
  ['/account/data-deletion', 'Data deletion'],
] as const;

/** Section label for breadcrumb; `/login` uses `?mode=register` instead of path alone. */
export function breadcrumbSectionLabel(pathname: string, search: string): string | null {
  if (pathname === '/login') {
    return authModeFromSearch(search) === 'register' ? 'Create account' : 'Sign in';
  }
  const entry = BREADCRUMB_NAV.find(([path]) => path === pathname);
  return entry ? entry[1] : null;
}
