/** Registered admin UI sections (path segment under `/admin`). */
export const ADMIN_SECTIONS = [
  { path: 'news', label: 'News' },
  { path: 'users', label: 'Users' },
  { path: 'payments', label: 'Payments' },
] as const;
