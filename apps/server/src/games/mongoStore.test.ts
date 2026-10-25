import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../db.js';
import { MongoSavedGameStore, resetMongoSavedGameStoreForTests } from './mongoStore.js';

describe('MongoSavedGameStore.upsert', () => {
  beforeEach(() => {
    resetMongoSavedGameStoreForTests();
  });

  it('returns stale_revision when conditional update matches nothing', async () => {
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 0 });
    const findOne = vi.fn().mockResolvedValue({ revision: 2 });
    const col = { updateOne, findOne, createIndex: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(dbModule, 'getDb').mockResolvedValue({
      collection: () => col,
    } as never);

    const store = new MongoSavedGameStore();
    const result = await store.upsert({
      userId: 'u1',
      mode: 'pvc',
      config: { level: 'beginner', side: 'r' },
      moves: [],
      baseRevision: 1,
    });

    expect(result).toEqual({ ok: false, reason: 'stale_revision' });
    expect(updateOne).toHaveBeenCalledWith(
      { userId: 'u1', mode: 'pvc', revision: 1 },
      expect.objectContaining({ $inc: { revision: 1 } }),
    );
  });

  it('increments revision on successful conditional update', async () => {
    const updatedDoc = {
      _id: { toHexString: () => 'abc' },
      userId: 'u1',
      mode: 'pvc',
      config: { level: 'beginner', side: 'r' },
      moves: [{ from: [7, 1], to: [7, 4] }],
      revision: 2,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    };
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const findOne = vi.fn().mockResolvedValue(updatedDoc);
    const col = { updateOne, findOne, createIndex: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(dbModule, 'getDb').mockResolvedValue({
      collection: () => col,
    } as never);

    const store = new MongoSavedGameStore();
    const result = await store.upsert({
      userId: 'u1',
      mode: 'pvc',
      config: { level: 'beginner', side: 'r' },
      moves: [{ from: [7, 1], to: [7, 4] }],
      baseRevision: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.revision).toBe(2);
    }
  });
});
