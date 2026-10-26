/**
 * Admin REST client for player lookup, access grants, and payment history.
 */
import { adminAuthHeader, clearAdminSession } from './adminApi';
import type { PublicPayment } from './billingApi';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

/** Must match `MAX_PLAY_AI_ACCESS_HOURS` in `apps/server/src/billing/config.ts`. */
export const MAX_PLAY_AI_ACCESS_HOURS = 8760;

export const DEFAULT_GRANT_ACCESS_HOURS = 24;

export interface AdminUserSummary {
  id: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  accessUntil: string | null;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  accessUntil: string | null;
  preferredModelId: string | null;
}

export interface UserIdentity {
  provider: string;
  sub: string;
}

export interface AccessInfo {
  active: boolean;
  accessUntil: string | null;
}

export interface AdminPaymentRow extends PublicPayment {
  userId: string;
  userEmail?: string;
}

export interface AdminUsersSearchResponse {
  users: AdminUserSummary[];
  nextCursor: string | null;
}

export interface AdminUserDetailResponse {
  user: PublicUser;
  identities: UserIdentity[];
  access: AccessInfo;
  payments: PublicPayment[];
}

export interface GrantRevokeResponse {
  user: PublicUser;
  access: AccessInfo;
}

export interface AdminPaymentsListResponse {
  payments: AdminPaymentRow[];
  nextCursor: string | null;
}

export class AdminUsersApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'AdminUsersApiError';
    this.status = status;
    this.code = code;
  }
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

function throwFromResponse(status: number, data: Record<string, unknown>): never {
  const code =
    typeof data.error === 'string'
      ? data.error
      : status === 401
        ? 'unauthorized'
        : 'request_failed';
  if (status === 401) {
    clearAdminSession();
  }
  throw new AdminUsersApiError(status, code);
}

async function adminUsersRequest<T>(
  path: string,
  init?: RequestInit & { expectEmpty?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...adminAuthHeader(),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const { expectEmpty: _expectEmpty, ...fetchInit } = init ?? {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchInit,
    headers,
  });

  if (init?.expectEmpty && res.status === 204) {
    return undefined as T;
  }

  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwFromResponse(res.status, data);
  }
  return data as T;
}

export function searchAdminUsers(params: { q: string; cursor?: string; limit?: number }) {
  const q = new URLSearchParams();
  q.set('q', params.q);
  if (params.cursor) q.set('cursor', params.cursor);
  if (params.limit != null) q.set('limit', String(params.limit));
  return adminUsersRequest<AdminUsersSearchResponse>(`/api/admin/users?${q.toString()}`);
}

export function fetchAdminUserDetail(userId: string) {
  return adminUsersRequest<AdminUserDetailResponse>(
    `/api/admin/users/${encodeURIComponent(userId)}`,
  );
}

export function fetchAdminPayments(params?: { cursor?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.cursor) q.set('cursor', params.cursor);
  if (params?.limit != null) q.set('limit', String(params.limit));
  const qs = q.toString();
  return adminUsersRequest<AdminPaymentsListResponse>(`/api/admin/payments${qs ? `?${qs}` : ''}`);
}

export function grantAdminUserAccess(userId: string, hours?: number) {
  const body = hours != null ? { hours } : undefined;
  return adminUsersRequest<GrantRevokeResponse>(
    `/api/admin/users/${encodeURIComponent(userId)}/grant`,
    {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

export function revokeAdminUserAccess(userId: string) {
  return adminUsersRequest<GrantRevokeResponse>(
    `/api/admin/users/${encodeURIComponent(userId)}/revoke`,
    { method: 'POST' },
  );
}

/** In-app path to open admin user detail (`userId` required; optional email `q` prefills search). */
export function adminUserDetailPath(userId: string, opts?: { q?: string }): string {
  const params = new URLSearchParams({ userId });
  const q = opts?.q?.trim();
  if (q) params.set('q', q);
  return `/admin/users?${params.toString()}`;
}
