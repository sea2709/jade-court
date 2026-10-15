/**
 * Admin session API: login, `/me`, and sessionStorage-backed Bearer auth.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export const ADMIN_SESSION_STORAGE_KEY = 'jade-court-admin-session';

export interface AdminSession {
  token: string;
  username: string;
  expiresAt: string;
}

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

function isSessionShape(data: unknown): data is AdminSession {
  if (typeof data !== 'object' || data === null) return false;
  const o = data as Record<string, unknown>;
  return (
    typeof o.token === 'string' && typeof o.username === 'string' && typeof o.expiresAt === 'string'
  );
}

function sessionExpired(expiresAt: string): boolean {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return true;
  return t <= Date.now();
}

async function parseJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function errorCode(data: Record<string, unknown>, status: number): string {
  if (typeof data.error === 'string') return data.error;
  if (status === 401) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'admin_disabled';
  return 'request_failed';
}

function throwAdminError(status: number, data: Record<string, unknown>, clearOn401 = false): never {
  const code = errorCode(data, status);
  if (status === 401 && clearOn401) {
    clearAdminSession();
  }
  throw new AdminApiError(status, code);
}

/** Returns a stored session or null after clearing invalid / expired entries. */
export function getAdminSession(): AdminSession | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isSessionShape(parsed)) {
      sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      return null;
    }
    if (sessionExpired(parsed.expiresAt)) {
      sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

/** Persists the admin session in `sessionStorage`. */
export function setAdminSession(session: AdminSession): void {
  try {
    sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

/** Removes the admin session from `sessionStorage`. */
export function clearAdminSession(): void {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Bearer header for admin API calls when a valid session exists. */
export function adminAuthHeader(): Record<string, string> {
  const session = getAdminSession();
  if (session?.token) {
    return { Authorization: `Bearer ${session.token}` };
  }
  return {};
}

const ADMIN_NEXT_RESOLVE_ORIGIN = 'http://jade-court.invalid';

function collapsePathSlashes(pathname: string): string {
  return pathname.replace(/\/{2,}/g, '/');
}

function isBlockedAdminLoginPath(pathname: string): boolean {
  return (
    pathname === '/admin/login' ||
    pathname === '/admin/login/' ||
    pathname.startsWith('/admin/login/')
  );
}

/**
 * Parses a raw `next` value into a safe in-app admin path, or null if invalid.
 * Uses URL resolution so `..`, `%2e`, and `@` tricks cannot escape `/admin`.
 */
function parseSafeAdminNext(raw: string): string | null {
  if (raw.includes('\\')) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;

  let url: URL;
  try {
    url = new URL(raw, ADMIN_NEXT_RESOLVE_ORIGIN);
  } catch {
    return null;
  }

  if (url.origin !== ADMIN_NEXT_RESOLVE_ORIGIN) return null;

  const pathname = collapsePathSlashes(url.pathname);
  if (isBlockedAdminLoginPath(pathname)) return null;
  if (pathname !== '/admin' && !pathname.startsWith('/admin/')) return null;

  return `${pathname}${url.search}${url.hash}`;
}

/**
 * Resolves a post-login redirect target to a safe admin path (defaults to `/admin`).
 * Returns normalized `pathname + search + hash`, never the raw attacker-controlled string.
 */
export function safeAdminNext(raw: string | null | undefined): string {
  if (raw == null || raw === '') return '/admin';
  return parseSafeAdminNext(raw) ?? '/admin';
}

/** Whether `next` is an allowed admin navigation target after normalization. */
export function isValidAdminNext(next: string): boolean {
  return parseSafeAdminNext(next) !== null;
}

/** Resolves `next` search param to a safe in-app admin path. */
export function resolveAdminNextParam(next: string | null | undefined): string {
  return safeAdminNext(next);
}

/** Authenticates with username/password and stores the returned session. */
export async function adminLogin(username: string, password: string): Promise<AdminSession> {
  const res = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwAdminError(res.status, data);
  }
  if (!isSessionShape(data)) {
    throw new AdminApiError(500, 'request_failed', 'Invalid login response.');
  }
  setAdminSession(data);
  return data;
}

/** Loads the current admin user; clears session on 401. */
export async function fetchAdminMe(): Promise<{ username: string }> {
  const res = await fetch(`${API_BASE}/api/admin/me`, {
    headers: {
      'Content-Type': 'application/json',
      ...adminAuthHeader(),
    },
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwAdminError(res.status, data, true);
  }
  const username = data.username;
  if (typeof username !== 'string') {
    throw new AdminApiError(500, 'request_failed', 'Invalid /me response.');
  }
  return { username };
}
