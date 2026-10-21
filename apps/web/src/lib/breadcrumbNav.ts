/**
 * Breadcrumb trail entries: public top-nav routes plus account (not in topbar nav).
 */
import { PUBLIC_NAV } from './publicNav';

export const BREADCRUMB_NAV = [...PUBLIC_NAV, ['/account', 'Account']] as const;
