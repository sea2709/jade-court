import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../db.js';
import { MongoUserStore, resetMongoUserStoreForTests } from './mongoStore.js';

describe('MongoUserStore.extendAccess', () => {
  const findOneAndUpdate = vi.fn();
  const createIndex = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    resetMongoUserStoreForTests();
    findOneAndUpdate.mockReset();
    vi.spyOn(dbModule, 'getDb').mockResolvedValue({
      collection: () => ({ findOneAndUpdate, createIndex }),
    } as never);
  });

  it('returns null for malformed ids without calling Mongo', async () => {
    const store = new MongoUserStore();
    expect(await store.extendAccess('not-an-object-id', 3600_000, new Date())).toBeNull();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('uses a single pipeline update with $max and $dateAdd', async () => {
    const id = new ObjectId();
    const now = new Date('2026-01-01T00:00:00.000Z');
    findOneAndUpdate.mockResolvedValue({
      _id: id,
      emailVerified: false,
      identities: [],
      createdAt: now,
      accessUntil: new Date(now.getTime() + 3600_000),
    });

    const store = new MongoUserStore();
    const updated = await store.extendAccess(id.toHexString(), 3600_000, now);
    expect(updated?.accessUntil?.getTime()).toBe(now.getTime() + 3600_000);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [, pipeline, options] = findOneAndUpdate.mock.calls[0] as [
      unknown,
      Array<{ $set: unknown }>,
      { returnDocument: string },
    ];
    expect(pipeline[0].$set).toMatchObject({
      accessUntil: {
        $dateAdd: {
          startDate: { $max: [now, { $ifNull: ['$accessUntil', now] }] },
          unit: 'millisecond',
          amount: 3600_000,
        },
      },
    });
    expect(options).toEqual({ returnDocument: 'after' });
  });
});
