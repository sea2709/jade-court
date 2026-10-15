/**
 * REST client for public news feed and admin curation API.
 */
import { adminAuthHeader, clearAdminSession } from './adminApi';
import { getGuestId } from './guestId';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface PublicNewsItem {
  id: string;
  sourceUrl: string;
  title: string;
  summary: string;
  publisher: string;
  sourceDomain: string;
  imageUrl?: string;
  publishedAt?: string;
  sortAt: string;
  tags: string[];
}

export interface AdminNewsItem extends PublicNewsItem {
  normalizedUrl: string;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
  publishedOnSiteAt?: string;
}

export interface NewsListResponse<T> {
  items: T[];
  nextCursor: string | null;
}

export interface NewsPreviewResult {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  publisher: string | null;
  publishedAt: string | null;
  canonicalUrl: string | null;
  duplicateOf?: { id: string; title: string; status: string };
}

export interface DuplicateExisting {
  id: string;
  title: string;
  status: string;
}

export class NewsApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly existing?: DuplicateExisting;

  constructor(
    status: number,
    code: string,
    message?: string,
    extras?: { fields?: Record<string, string>; existing?: DuplicateExisting },
  ) {
    super(message ?? code);
    this.name = 'NewsApiError';
    this.status = status;
    this.code = code;
    this.fields = extras?.fields;
    this.existing = extras?.existing;
  }
}

async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function throwFromResponse(
  status: number,
  data: Record<string, unknown>,
  options?: { admin?: boolean },
): never {
  const code = typeof data.error === 'string' ? data.error : resStatusFallback(status);
  if (status === 401 && options?.admin) {
    clearAdminSession();
  }
  const fields =
    data.fields && typeof data.fields === 'object'
      ? (data.fields as Record<string, string>)
      : undefined;
  const existing =
    data.existing && typeof data.existing === 'object'
      ? (data.existing as DuplicateExisting)
      : undefined;
  throw new NewsApiError(status, code, code, { fields, existing });
}

function resStatusFallback(status: number): string {
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not_found';
  return 'request_failed';
}

async function newsRequest<T>(
  path: string,
  init?: RequestInit & { admin?: boolean; expectEmpty?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-guest-id': getGuestId(),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.admin) {
    Object.assign(headers, adminAuthHeader());
  }

  const { admin: _admin, expectEmpty: _expectEmpty, ...fetchInit } = init ?? {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchInit,
    headers,
  });

  if (init?.expectEmpty && res.status === 204) {
    return undefined as T;
  }

  const data = (await parseJsonBody(res)) as Record<string, unknown>;
  if (!res.ok) {
    throwFromResponse(res.status, data, { admin: init?.admin });
  }
  return data as T;
}

export function fetchPublicNews(params?: { cursor?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.cursor) q.set('cursor', params.cursor);
  if (params?.limit != null) q.set('limit', String(params.limit));
  const qs = q.toString();
  return newsRequest<NewsListResponse<PublicNewsItem>>(`/api/news${qs ? `?${qs}` : ''}`);
}

export function fetchAdminNews(params?: { status?: string; q?: string; cursor?: string }) {
  const q = new URLSearchParams();
  if (params?.status && params.status !== 'all') q.set('status', params.status);
  if (params?.q) q.set('q', params.q);
  if (params?.cursor) q.set('cursor', params.cursor);
  const qs = q.toString();
  return newsRequest<NewsListResponse<AdminNewsItem>>(`/api/admin/news${qs ? `?${qs}` : ''}`, {
    admin: true,
  });
}

export function previewAdminNewsUrl(url: string) {
  return newsRequest<NewsPreviewResult>('/api/admin/news/preview', {
    method: 'POST',
    admin: true,
    body: JSON.stringify({ url }),
  });
}

export interface CreateNewsPayload {
  sourceUrl: string;
  title?: string;
  summary?: string;
  publisher?: string;
  publishedAt?: string;
  imageUrl?: string;
  tags?: string[];
  status?: 'draft' | 'published' | 'archived';
}

export function createAdminNewsItem(payload: CreateNewsPayload) {
  return newsRequest<AdminNewsItem>('/api/admin/news', {
    method: 'POST',
    admin: true,
    body: JSON.stringify(payload),
  });
}

export function patchAdminNewsItem(id: string, payload: Partial<CreateNewsPayload>) {
  return newsRequest<AdminNewsItem>(`/api/admin/news/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    admin: true,
    body: JSON.stringify(payload),
  });
}

export function deleteAdminNewsItem(id: string) {
  return newsRequest<void>(`/api/admin/news/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    admin: true,
    expectEmpty: true,
  });
}
