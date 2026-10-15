import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { encodeNewsCursor } from './cursor.js';
import {
  MongoNewsStore,
  resetMongoNewsStoreForTests,
  StorageUnavailableError,
} from './mongoStore.js';
import { InvalidCursorError, NotFoundError } from './memoryStore.js';
import { NewsDuplicateError } from './types.js';

const getDb = vi.hoisted(() => vi.fn());

vi.mock('../db.js', () => ({
  getDb,
}));

type MongoNewsDoc = {
  _id: ObjectId;
  sourceUrl: string;
  normalizedUrl: string;
  title: string;
  summary: string;
  publisher: string;
  sourceDomain: string;
  sortAt: Date;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  createdAt: Date;
  updatedAt: Date;
};

function makeDoc(partial: Partial<MongoNewsDoc> & { _id?: ObjectId }): MongoNewsDoc {
  const _id = partial._id ?? new ObjectId();
  const createdAt = partial.createdAt ?? new Date('2024-01-01T00:00:00Z');
  return {
    sourceUrl: 'https://example.com/a',
    normalizedUrl: `https://example.com/${_id.toHexString()}`,
    title: 'Title',
    summary: 'Summary at least twenty chars.',
    publisher: 'Pub',
    sourceDomain: 'example.com',
    sortAt: partial.sortAt ?? createdAt,
    tags: [],
    status: 'published',
    createdAt,
    updatedAt: createdAt,
    ...partial,
    _id,
  };
}

function mockCollection(initial: {
  findResults?: MongoNewsDoc[];
  findOne?: (filter: Record<string, unknown>) => MongoNewsDoc | null;
  insertOne?: () => Promise<{ insertedId: ObjectId }>;
  updateOne?: () => Promise<unknown>;
  deleteOne?: (filter: Record<string, unknown>) => Promise<{ deletedCount: number }>;
}) {
  const createIndex = vi.fn(async () => undefined);
  let lastFindFilter: Record<string, unknown> | undefined;
  let lastSort: Record<string, number> | undefined;
  let lastLimit: number | undefined;

  const find = vi.fn((filter: Record<string, unknown>) => {
    lastFindFilter = filter;
    return {
      sort: vi.fn((sort: Record<string, number>) => {
        lastSort = sort;
        return {
          limit: vi.fn((limit: number) => {
            lastLimit = limit;
            return {
              toArray: vi.fn(async () => initial.findResults ?? []),
            };
          }),
        };
      }),
    };
  });

  const findOne = vi.fn(async (filter: Record<string, unknown>) => {
    if (initial.findOne) return initial.findOne(filter);
    return null;
  });

  const insertOne = vi.fn(
    initial.insertOne ??
      (async () => ({
        insertedId: new ObjectId(),
      })),
  );

  const updateOne = vi.fn(initial.updateOne ?? (async () => ({ matchedCount: 1 })));

  const deleteOne = vi.fn(
    initial.deleteOne ??
      (async () => ({
        deletedCount: 0,
      })),
  );

  const collection = {
    createIndex,
    find,
    findOne,
    insertOne,
    updateOne,
    deleteOne,
  };

  const db = {
    collection: vi.fn(() => collection),
  };

  getDb.mockResolvedValue(db);

  return {
    db,
    collection,
    createIndex,
    find,
    findOne,
    insertOne,
    updateOne,
    deleteOne,
    get lastFindFilter() {
      return lastFindFilter;
    },
    get lastSort() {
      return lastSort;
    },
    get lastLimit() {
      return lastLimit;
    },
  };
}

describe('MongoNewsStore', () => {
  beforeEach(() => {
    resetMongoNewsStoreForTests();
    getDb.mockReset();
  });

  afterEach(() => {
    resetMongoNewsStoreForTests();
  });

  it('creates indexes once on first collection use', async () => {
    const mocks = mockCollection({});
    const store = new MongoNewsStore();

    await store.list({ limit: 1 });
    await store.list({ limit: 1 });

    expect(mocks.createIndex).toHaveBeenCalledTimes(2);
    expect(mocks.createIndex).toHaveBeenCalledWith({ normalizedUrl: 1 }, { unique: true });
    expect(mocks.createIndex).toHaveBeenCalledWith({ status: 1, sortAt: -1, _id: -1 });
  });

  it('throws StorageUnavailableError when getDb returns null', async () => {
    getDb.mockResolvedValue(null);
    const store = new MongoNewsStore();
    await expect(store.list({ limit: 1 })).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('list queries published status with sort and limit+1', async () => {
    const doc = makeDoc({});
    const mocks = mockCollection({ findResults: [doc] });
    const store = new MongoNewsStore();

    const result = await store.list({ limit: 12 });

    expect(mocks.lastFindFilter).toEqual({ status: 'published' });
    expect(mocks.lastSort).toEqual({ sortAt: -1, _id: -1 });
    expect(mocks.lastLimit).toBe(13);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(doc._id.toHexString());
    expect(result.nextCursor).toBeNull();
  });

  it('listAdmin combines status, escaped q, and cursor in $and', async () => {
    const id = new ObjectId();
    const sortAt = new Date('2024-06-01T00:00:00Z');
    const cursor = encodeNewsCursor(sortAt, id.toHexString());
    const mocks = mockCollection({ findResults: [] });
    const store = new MongoNewsStore();

    await store.listAdmin({
      limit: 50,
      status: 'draft',
      q: 'foo.bar?',
      cursor,
    });

    expect(mocks.lastFindFilter).toEqual({
      $and: [
        { status: 'draft' },
        { $or: [{ title: /foo\.bar\?/i }, { publisher: /foo\.bar\?/i }] },
        {
          $or: [{ sortAt: { $lt: sortAt } }, { sortAt, _id: { $lt: id } }],
        },
      ],
    });
    expect(mocks.lastLimit).toBe(51);
  });

  it('returns nextCursor when find returns more than limit rows', async () => {
    const docs = [makeDoc({}), makeDoc({})];
    mockCollection({ findResults: docs });
    const store = new MongoNewsStore();

    const result = await store.list({ limit: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe(encodeNewsCursor(docs[0]!.sortAt, docs[0]!._id.toHexString()));
  });

  it('maps duplicate key on create to NewsDuplicateError', async () => {
    const existingId = new ObjectId();
    const existing = makeDoc({ _id: existingId, normalizedUrl: 'https://ex.com/dup' });

    const mocks = mockCollection({
      insertOne: async () => {
        throw Object.assign(new Error('dup'), { code: 11000 });
      },
      findOne: (filter) => {
        if (filter.normalizedUrl === 'https://ex.com/dup') return existing;
        return null;
      },
    });

    const store = new MongoNewsStore();
    await expect(
      store.create({
        sourceUrl: 'https://ex.com/dup',
        normalizedUrl: 'https://ex.com/dup',
        sourceDomain: 'ex.com',
        title: '',
        summary: '',
        publisher: '',
        tags: [],
        status: 'draft',
      }),
    ).rejects.toMatchObject({
      existing: { id: existingId.toHexString() },
    });
    expect(mocks.insertOne).toHaveBeenCalled();
  });

  it('update throws NotFoundError for missing id', async () => {
    mockCollection({
      findOne: async () => null,
    });
    const store = new MongoNewsStore();
    const id = new ObjectId().toHexString();

    await expect(store.update(id, { title: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('update throws NotFoundError for invalid ObjectId', async () => {
    mockCollection({});
    const store = new MongoNewsStore();
    await expect(store.update('not-an-object-id', { title: 'x' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('remove returns false for invalid id or missing doc', async () => {
    mockCollection({
      deleteOne: async () => ({ deletedCount: 0 }),
    });
    const store = new MongoNewsStore();

    expect(await store.remove('bad-id')).toBe(false);

    const id = new ObjectId().toHexString();
    expect(await store.remove(id)).toBe(false);
  });

  it('remove returns true when deleteOne removes one document', async () => {
    mockCollection({
      deleteOne: async () => ({ deletedCount: 1 }),
    });
    const store = new MongoNewsStore();
    const id = new ObjectId().toHexString();
    expect(await store.remove(id)).toBe(true);
  });

  it('throws InvalidCursorError for malformed cursor', async () => {
    mockCollection({});
    const store = new MongoNewsStore();
    await expect(store.list({ limit: 1, cursor: '???' })).rejects.toBeInstanceOf(
      InvalidCursorError,
    );
  });

  it('update $sets only patched fields, not a full document snapshot', async () => {
    const selfId = new ObjectId();
    const staleImage = '/api/news/images/550e8400-e29b-41d4-a716-446655440000.png';
    const self = makeDoc({
      _id: selfId,
      title: 'Before',
      imageUrl: staleImage,
    });

    let capturedUpdate: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> } = {};
    mockCollection({
      findOne: (filter) => {
        const oid = filter._id as ObjectId | undefined;
        if (oid?.equals(selfId)) return self;
        return null;
      },
      updateOne: async (_filter, update) => {
        capturedUpdate = update as typeof capturedUpdate;
      },
    });

    const store = new MongoNewsStore();
    const doc = await store.update(selfId.toHexString(), { title: 'After title only' });

    expect(doc.title).toBe('After title only');
    expect(doc.imageUrl).toBe(staleImage);
    expect(capturedUpdate.$set?.title).toBe('After title only');
    expect(capturedUpdate.$set?.updatedAt).toBeInstanceOf(Date);
    expect(capturedUpdate.$set).not.toHaveProperty('imageUrl');
    expect(Object.keys(capturedUpdate.$set ?? {}).sort()).toEqual(['title', 'updatedAt']);
  });

  it('update throws NewsDuplicateError when normalizedUrl collides', async () => {
    const selfId = new ObjectId();
    const otherId = new ObjectId();
    const self = makeDoc({ _id: selfId, normalizedUrl: 'https://ex.com/a' });
    const other = makeDoc({ _id: otherId, normalizedUrl: 'https://ex.com/b' });

    mockCollection({
      findOne: (filter) => {
        const oid = filter._id as ObjectId | undefined;
        if (oid?.equals(selfId)) return self;
        if (filter.normalizedUrl === 'https://ex.com/b') return other;
        return null;
      },
    });

    const store = new MongoNewsStore();
    await expect(
      store.update(selfId.toHexString(), { normalizedUrl: 'https://ex.com/b' }),
    ).rejects.toBeInstanceOf(NewsDuplicateError);
  });
});
