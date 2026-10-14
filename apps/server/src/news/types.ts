/**
 * Shared types for curated news items, API payloads, and the NewsStore layer.
 */

export const NEWS_STATUSES = ['draft', 'published', 'archived'] as const;
export type NewsStatus = (typeof NEWS_STATUSES)[number];

export const NEWS_TAGS = [
  'tournament',
  'players',
  'culture',
  'learning',
  'engines',
  'community',
] as const;
export type NewsTag = (typeof NEWS_TAGS)[number];

/** Document shape stored in MongoDB or memory. */
export interface NewsDocument {
  id: string;
  sourceUrl: string;
  normalizedUrl: string;
  title: string;
  summary: string;
  publisher: string;
  sourceDomain: string;
  imageUrl?: string;
  publishedAt?: Date;
  sortAt: Date;
  tags: NewsTag[];
  status: NewsStatus;
  createdAt: Date;
  updatedAt: Date;
  publishedOnSiteAt?: Date;
}

/** Fields exposed on the public news feed. */
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

/** Admin list/detail includes curation metadata. */
export interface AdminNewsItem extends PublicNewsItem {
  normalizedUrl: string;
  status: NewsStatus;
  createdAt: string;
  updatedAt: string;
  publishedOnSiteAt?: string;
}

export interface NewsListResult<T> {
  items: T[];
  nextCursor: string | null;
}

export interface NewsListOptions {
  limit: number;
  cursor?: string;
}

export interface AdminListOptions extends NewsListOptions {
  status?: NewsStatus;
  q?: string;
}

export interface CreateNewsInput {
  sourceUrl: string;
  title?: string;
  summary?: string;
  publisher?: string;
  publishedAt?: Date;
  imageUrl?: string;
  tags?: NewsTag[];
  status?: NewsStatus;
}

export interface UpdateNewsInput {
  sourceUrl?: string;
  title?: string;
  summary?: string;
  publisher?: string;
  publishedAt?: Date | null;
  imageUrl?: string | null;
  tags?: NewsTag[];
  status?: NewsStatus;
}

/** Thrown when normalizedUrl collides with an existing item. */
export class NewsDuplicateError extends Error {
  readonly code = 'duplicate' as const;

  constructor(public readonly existing: { id: string; title: string; status: NewsStatus }) {
    super('duplicate');
    this.name = 'NewsDuplicateError';
  }
}

/** Map a stored document to the public API shape. */
export function toPublicNewsItem(doc: NewsDocument): PublicNewsItem {
  return {
    id: doc.id,
    sourceUrl: doc.sourceUrl,
    title: doc.title,
    summary: doc.summary,
    publisher: doc.publisher,
    sourceDomain: doc.sourceDomain,
    ...(doc.imageUrl ? { imageUrl: doc.imageUrl } : {}),
    ...(doc.publishedAt ? { publishedAt: doc.publishedAt.toISOString() } : {}),
    sortAt: doc.sortAt.toISOString(),
    tags: [...doc.tags],
  };
}

/** Map a stored document to the admin API shape. */
export function toAdminNewsItem(doc: NewsDocument): AdminNewsItem {
  return {
    ...toPublicNewsItem(doc),
    normalizedUrl: doc.normalizedUrl,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    ...(doc.publishedOnSiteAt ? { publishedOnSiteAt: doc.publishedOnSiteAt.toISOString() } : {}),
  };
}
