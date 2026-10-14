/**
 * MongoDB-backed NewsStore — ensures indexes on first use, maps duplicate keys to NewsDuplicateError.
 */
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { decodeNewsCursor, encodeNewsCursor } from './cursor.js';
import { InvalidCursorError, NotFoundError } from './memoryStore.js';
import type { NewsStore, NormalizedCreateFields, NormalizedUpdateFields } from './store.js';
import {
  NewsDuplicateError,
  type AdminListOptions,
  type AdminNewsItem,
  type CreateNewsInput,
  type NewsDocument,
  type NewsListOptions,
  type NewsListResult,
  type NewsStatus,
  type NewsTag,
  type PublicNewsItem,
  type UpdateNewsInput,
} from './types.js';
import { toAdminNewsItem, toPublicNewsItem } from './types.js';

const COLLECTION = 'news';

interface MongoNewsDoc {
  _id: ObjectId;
  sourceUrl: string;
  normalizedUrl: string;
  title: string;
  summary: string;
  publisher: string;
  sourceDomain: string;
  imageUrl?: string;
  publishedAt?: Date;
  sortAt: Date;
  tags: string[];
  status: NewsStatus;
  createdAt: Date;
  updatedAt: Date;
  publishedOnSiteAt?: Date;
}

let indexesEnsured = false;

/** Reset index bootstrap flag (Vitest only). */
export function resetMongoNewsStoreForTests(): void {
  indexesEnsured = false;
}

async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();
  if (!db) return;
  const col = db.collection<MongoNewsDoc>(COLLECTION);
  await col.createIndex({ normalizedUrl: 1 }, { unique: true });
  await col.createIndex({ status: 1, sortAt: -1, _id: -1 });
  indexesEnsured = true;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fromMongo(doc: MongoNewsDoc): NewsDocument {
  return {
    id: doc._id.toHexString(),
    sourceUrl: doc.sourceUrl,
    normalizedUrl: doc.normalizedUrl,
    title: doc.title,
    summary: doc.summary,
    publisher: doc.publisher,
    sourceDomain: doc.sourceDomain,
    ...(doc.imageUrl ? { imageUrl: doc.imageUrl } : {}),
    ...(doc.publishedAt ? { publishedAt: doc.publishedAt } : {}),
    sortAt: doc.sortAt,
    tags: doc.tags as NewsTag[],
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(doc.publishedOnSiteAt ? { publishedOnSiteAt: doc.publishedOnSiteAt } : {}),
  };
}

function computeSortAt(publishedAt: Date | undefined, createdAt: Date): Date {
  return publishedAt ?? createdAt;
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: number }).code === 11000
  );
}

export class MongoNewsStore implements NewsStore {
  private async collection() {
    await ensureIndexes();
    const db = await getDb();
    if (!db) throw new StorageUnavailableError();
    return db.collection<MongoNewsDoc>(COLLECTION);
  }

  async list(options: NewsListOptions): Promise<NewsListResult<PublicNewsItem>> {
    const { items, nextCursor } = await this.query(options, { status: 'published' });
    return { items: items.map(toPublicNewsItem), nextCursor };
  }

  async listAdmin(options: AdminListOptions): Promise<NewsListResult<AdminNewsItem>> {
    const { items, nextCursor } = await this.query(options, {
      status: options.status,
      q: options.q,
    });
    return { items: items.map(toAdminNewsItem), nextCursor };
  }

  private async query(
    options: NewsListOptions,
    filters: { status?: NewsStatus; q?: string },
  ): Promise<NewsListResult<NewsDocument>> {
    const col = await this.collection();
    const clauses: Record<string, unknown>[] = [];
    if (filters.status) clauses.push({ status: filters.status });
    if (filters.q?.trim()) {
      const re = new RegExp(escapeRegex(filters.q.trim()), 'i');
      clauses.push({ $or: [{ title: re }, { publisher: re }] });
    }
    if (options.cursor) {
      const decoded = decodeNewsCursor(options.cursor);
      if (!decoded) throw new InvalidCursorError();
      let cursorId: ObjectId;
      try {
        cursorId = new ObjectId(decoded.id);
      } catch {
        throw new InvalidCursorError();
      }
      clauses.push({
        $or: [
          { sortAt: { $lt: decoded.sortAt } },
          { sortAt: decoded.sortAt, _id: { $lt: cursorId } },
        ],
      });
    }
    const mongoFilter =
      clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0]! : { $and: clauses };

    const limit = options.limit;
    const docs = await col
      .find(mongoFilter)
      .sort({ sortAt: -1, _id: -1 })
      .limit(limit + 1)
      .toArray();

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeNewsCursor(last.sortAt, last._id.toHexString()) : null;

    return { items: page.map(fromMongo), nextCursor };
  }

  async get(id: string): Promise<NewsDocument | null> {
    const col = await this.collection();
    let oid: ObjectId;
    try {
      oid = new ObjectId(id);
    } catch {
      return null;
    }
    const doc = await col.findOne({ _id: oid });
    return doc ? fromMongo(doc) : null;
  }

  async findByNormalizedUrl(normalizedUrl: string): Promise<NewsDocument | null> {
    const col = await this.collection();
    const doc = await col.findOne({ normalizedUrl });
    return doc ? fromMongo(doc) : null;
  }

  async create(input: CreateNewsInput & NormalizedCreateFields): Promise<NewsDocument> {
    const col = await this.collection();
    const now = new Date();
    const status = input.status ?? 'draft';
    const sortAt = computeSortAt(input.publishedAt, now);
    const doc: Omit<MongoNewsDoc, '_id'> = {
      sourceUrl: input.sourceUrl,
      normalizedUrl: input.normalizedUrl,
      title: input.title ?? '',
      summary: input.summary ?? '',
      publisher: input.publisher ?? '',
      sourceDomain: input.sourceDomain,
      tags: input.tags ?? [],
      status,
      createdAt: now,
      updatedAt: now,
      sortAt,
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
      ...(status === 'published' ? { publishedOnSiteAt: now } : {}),
    };

    try {
      const result = await col.insertOne({ _id: new ObjectId(), ...doc });
      return fromMongo({ _id: result.insertedId, ...doc });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        const existing = await this.findByNormalizedUrl(input.normalizedUrl);
        if (existing) {
          throw new NewsDuplicateError({
            id: existing.id,
            title: existing.title,
            status: existing.status,
          });
        }
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateNewsInput & NormalizedUpdateFields): Promise<NewsDocument> {
    const col = await this.collection();
    let oid: ObjectId;
    try {
      oid = new ObjectId(id);
    } catch {
      throw new NotFoundError();
    }

    const current = await col.findOne({ _id: oid });
    if (!current) throw new NotFoundError();

    if (input.normalizedUrl && input.normalizedUrl !== current.normalizedUrl) {
      const existing = await col.findOne({ normalizedUrl: input.normalizedUrl });
      if (existing && !existing._id.equals(oid)) {
        const mapped = fromMongo(existing);
        throw new NewsDuplicateError({
          id: mapped.id,
          title: mapped.title,
          status: mapped.status,
        });
      }
    }

    const now = new Date();
    const set: Partial<MongoNewsDoc> = { updatedAt: now };
    const unset: Record<string, ''> = {};

    if (input.sourceUrl !== undefined) set.sourceUrl = input.sourceUrl;
    if (input.normalizedUrl !== undefined) set.normalizedUrl = input.normalizedUrl;
    if (input.sourceDomain !== undefined) set.sourceDomain = input.sourceDomain;
    if (input.title !== undefined) set.title = input.title;
    if (input.summary !== undefined) set.summary = input.summary;
    if (input.publisher !== undefined) set.publisher = input.publisher;
    if (input.tags !== undefined) set.tags = input.tags;
    if (input.status !== undefined) set.status = input.status;

    if (input.publishedAt === null) {
      unset.publishedAt = '';
    } else if (input.publishedAt !== undefined) {
      set.publishedAt = input.publishedAt;
    }

    if (input.imageUrl === null) {
      unset.imageUrl = '';
    } else if (input.imageUrl !== undefined) {
      set.imageUrl = input.imageUrl;
    }

    const merged: MongoNewsDoc = { ...current, ...set };
    if (unset.publishedAt) delete merged.publishedAt;
    if (unset.imageUrl) delete merged.imageUrl;
    merged.sortAt = computeSortAt(merged.publishedAt, merged.createdAt);

    const wasPublished = current.status === 'published';
    const nowPublished = merged.status === 'published';
    if (!wasPublished && nowPublished && !current.publishedOnSiteAt) {
      merged.publishedOnSiteAt = now;
    }

    try {
      const update: { $set: Partial<MongoNewsDoc>; $unset?: Record<string, ''> } = { $set: merged };
      if (Object.keys(unset).length > 0) update.$unset = unset;
      await col.updateOne({ _id: oid }, update);
    } catch (err) {
      if (isDuplicateKeyError(err) && input.normalizedUrl) {
        const existing = await this.findByNormalizedUrl(input.normalizedUrl);
        if (existing) {
          throw new NewsDuplicateError({
            id: existing.id,
            title: existing.title,
            status: existing.status,
          });
        }
      }
      throw err;
    }

    return fromMongo(merged);
  }

  async remove(id: string): Promise<boolean> {
    const col = await this.collection();
    let oid: ObjectId;
    try {
      oid = new ObjectId(id);
    } catch {
      return false;
    }
    const result = await col.deleteOne({ _id: oid });
    return result.deletedCount === 1;
  }
}

export class StorageUnavailableError extends Error {
  readonly code = 'news_storage_unavailable' as const;
  constructor() {
    super('news_storage_unavailable');
  }
}
