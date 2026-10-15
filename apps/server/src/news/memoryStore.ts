/**
 * In-memory NewsStore for tests — same sort, cursor, and duplicate semantics as Mongo.
 */
import { randomUUID } from 'node:crypto';
import { decodeNewsCursor, encodeNewsCursor, isBeforeCursor } from './cursor.js';
import type { NewsStore, NormalizedCreateFields, NormalizedUpdateFields } from './store.js';
import { NewsDuplicateError } from './types.js';
import type {
  AdminListOptions,
  AdminNewsItem,
  CreateNewsInput,
  NewsDocument,
  NewsListOptions,
  NewsListResult,
  NewsStatus,
  PublicNewsItem,
  UpdateNewsInput,
} from './types.js';
import { toAdminNewsItem, toPublicNewsItem } from './types.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function computeSortAt(publishedAt: Date | undefined, createdAt: Date): Date {
  return publishedAt ?? createdAt;
}

export class InvalidCursorError extends Error {
  readonly code = 'invalid_cursor' as const;
  constructor() {
    super('invalid_cursor');
  }
}

export class NotFoundError extends Error {
  readonly code = 'not_found' as const;
  constructor() {
    super('not_found');
  }
}

export class MemoryNewsStore implements NewsStore {
  private docs = new Map<string, NewsDocument>();

  constructor(seed: NewsDocument[] = []) {
    for (const doc of seed) {
      this.docs.set(doc.id, { ...doc });
    }
  }

  /** Snapshot of all documents (tests). */
  all(): NewsDocument[] {
    return [...this.docs.values()];
  }

  async list(options: NewsListOptions): Promise<NewsListResult<PublicNewsItem>> {
    const { items, nextCursor } = this.paginate(options, 'published');
    return { items: items.map(toPublicNewsItem), nextCursor };
  }

  async listAdmin(options: AdminListOptions): Promise<NewsListResult<AdminNewsItem>> {
    const { items, nextCursor } = this.paginate(options, options.status, options.q);
    return { items: items.map(toAdminNewsItem), nextCursor };
  }

  private paginate(
    options: NewsListOptions,
    statusFilter?: NewsStatus,
    q?: string,
  ): NewsListResult<NewsDocument> {
    let rows = [...this.docs.values()];

    if (statusFilter) {
      rows = rows.filter((d) => d.status === statusFilter);
    }

    if (q?.trim()) {
      const re = new RegExp(escapeRegex(q.trim()), 'i');
      rows = rows.filter((d) => re.test(d.title) || re.test(d.publisher));
    }

    rows.sort((a, b) => {
      const t = b.sortAt.getTime() - a.sortAt.getTime();
      if (t !== 0) return t;
      return b.id.localeCompare(a.id);
    });

    if (options.cursor) {
      const decoded = decodeNewsCursor(options.cursor);
      if (!decoded) throw new InvalidCursorError();
      rows = rows.filter((d) => isBeforeCursor(d, decoded));
    }

    const limit = options.limit;
    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeNewsCursor(last.sortAt, last.id) : null;

    return { items: page, nextCursor };
  }

  async get(id: string): Promise<NewsDocument | null> {
    const doc = this.docs.get(id);
    return doc ? { ...doc } : null;
  }

  async findByNormalizedUrl(normalizedUrl: string): Promise<NewsDocument | null> {
    for (const doc of this.docs.values()) {
      if (doc.normalizedUrl === normalizedUrl) return { ...doc };
    }
    return null;
  }

  async create(input: CreateNewsInput & NormalizedCreateFields): Promise<NewsDocument> {
    const existing = await this.findByNormalizedUrl(input.normalizedUrl);
    if (existing) {
      throw new NewsDuplicateError({
        id: existing.id,
        title: existing.title,
        status: existing.status,
      });
    }

    const now = new Date();
    const id = randomUUID();
    const createdAt = now;
    const sortAt = computeSortAt(input.publishedAt, createdAt);
    const status = input.status ?? 'draft';
    const doc: NewsDocument = {
      id,
      sourceUrl: input.sourceUrl,
      normalizedUrl: input.normalizedUrl,
      title: input.title ?? '',
      summary: input.summary ?? '',
      publisher: input.publisher ?? '',
      sourceDomain: input.sourceDomain,
      tags: input.tags ?? [],
      status,
      createdAt,
      updatedAt: now,
      sortAt,
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
      ...(status === 'published' ? { publishedOnSiteAt: now } : {}),
    };
    this.docs.set(id, doc);
    return { ...doc };
  }

  async update(id: string, input: UpdateNewsInput & NormalizedUpdateFields): Promise<NewsDocument> {
    const current = this.docs.get(id);
    if (!current) throw new NotFoundError();

    if (input.normalizedUrl && input.normalizedUrl !== current.normalizedUrl) {
      const existing = await this.findByNormalizedUrl(input.normalizedUrl);
      if (existing && existing.id !== id) {
        throw new NewsDuplicateError({
          id: existing.id,
          title: existing.title,
          status: existing.status,
        });
      }
    }

    const now = new Date();
    const next: NewsDocument = { ...current, updatedAt: now };

    if (input.sourceUrl !== undefined) next.sourceUrl = input.sourceUrl;
    if (input.normalizedUrl !== undefined) next.normalizedUrl = input.normalizedUrl;
    if (input.sourceDomain !== undefined) next.sourceDomain = input.sourceDomain;
    if (input.title !== undefined) next.title = input.title;
    if (input.summary !== undefined) next.summary = input.summary;
    if (input.publisher !== undefined) next.publisher = input.publisher;
    if (input.tags !== undefined) next.tags = input.tags;
    if (input.status !== undefined) next.status = input.status;

    if (input.publishedAt === null) {
      delete next.publishedAt;
    } else if (input.publishedAt !== undefined) {
      next.publishedAt = input.publishedAt;
    }

    if (input.imageUrl === null) {
      delete next.imageUrl;
    } else if (input.imageUrl !== undefined) {
      next.imageUrl = input.imageUrl;
    }

    next.sortAt = computeSortAt(next.publishedAt, next.createdAt);

    const wasPublished = current.status === 'published';
    const nowPublished = next.status === 'published';
    if (!wasPublished && nowPublished && !next.publishedOnSiteAt) {
      next.publishedOnSiteAt = now;
    }

    this.docs.set(id, next);
    return { ...next };
  }

  async remove(id: string): Promise<boolean> {
    return this.docs.delete(id);
  }

  async countByImageUrl(imageUrl: string, excludeId?: string): Promise<number> {
    let n = 0;
    for (const doc of this.docs.values()) {
      if (doc.imageUrl !== imageUrl) continue;
      if (excludeId && doc.id === excludeId) continue;
      n += 1;
    }
    return n;
  }
}
