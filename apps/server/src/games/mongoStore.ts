/**
 * MongoDB-backed SavedGameStore — unique `userId`+`mode`, TTL on `updatedAt`.
 */
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import type {
  GameMode,
  PvcConfig,
  AiConfig,
  SavedChatMessage,
  SavedGameRecord,
  SavedMove,
} from './types.js';
import type { SavedGameStore } from './store.js';
import type { UpsertActiveGameInput, UpsertActiveGameResult } from './types.js';
import { toActiveGameSummary } from './serialize.js';

const COLLECTION = 'savedGames';
const TTL_SECONDS = 30 * 24 * 60 * 60;

interface MongoSavedGameDoc {
  _id: ObjectId;
  userId: string;
  mode: GameMode;
  config: PvcConfig | AiConfig;
  moves: SavedMove[];
  chat?: SavedChatMessage[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

let indexesEnsured = false;

/** Reset index bootstrap flag (Vitest only). */
export function resetMongoSavedGameStoreForTests(): void {
  indexesEnsured = false;
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: number }).code === 11000
  );
}

async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getDb();
  if (!db) return;
  const col = db.collection<MongoSavedGameDoc>(COLLECTION);
  await col.createIndex({ userId: 1, mode: 1 }, { unique: true });
  await col.createIndex({ updatedAt: 1 }, { expireAfterSeconds: TTL_SECONDS });
  indexesEnsured = true;
}

function fromMongo(doc: MongoSavedGameDoc): SavedGameRecord {
  return {
    userId: doc.userId,
    mode: doc.mode,
    config: doc.config,
    moves: doc.moves,
    ...(doc.chat ? { chat: doc.chat } : {}),
    revision: doc.revision,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoSavedGameStore implements SavedGameStore {
  async listSummaries(userId: string) {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return [];
    const col = db.collection<MongoSavedGameDoc>(COLLECTION);
    const docs = await col.find({ userId }).sort({ updatedAt: -1 }).toArray();
    return docs.map(fromMongo).map(toActiveGameSummary);
  }

  async findByUserAndMode(userId: string, mode: GameMode): Promise<SavedGameRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return null;
    const col = db.collection<MongoSavedGameDoc>(COLLECTION);
    const doc = await col.findOne({ userId, mode });
    return doc ? fromMongo(doc) : null;
  }

  async upsert(input: UpsertActiveGameInput): Promise<UpsertActiveGameResult> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) {
      throw new Error('MongoSavedGameStore requires MONGODB_URI');
    }
    const col = db.collection<MongoSavedGameDoc>(COLLECTION);
    const baseRevision = input.baseRevision ?? 0;
    const now = new Date();

    if (baseRevision === 0) {
      const doc: MongoSavedGameDoc = {
        _id: new ObjectId(),
        userId: input.userId,
        mode: input.mode,
        config: input.config,
        moves: input.moves,
        ...(input.chat ? { chat: input.chat } : {}),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await col.insertOne(doc);
        return { ok: true, record: fromMongo(doc) };
      } catch (err) {
        if (!isDuplicateKeyError(err)) throw err;
        return { ok: false, reason: 'stale_revision' };
      }
    }

    const $set: Record<string, unknown> = {
      config: input.config,
      moves: input.moves,
      updatedAt: now,
    };
    if (input.chat !== undefined) {
      $set.chat = input.chat;
    }

    const result = await col.updateOne(
      { userId: input.userId, mode: input.mode, revision: baseRevision },
      { $set, $inc: { revision: 1 } },
    );

    if (result.modifiedCount === 0) {
      return { ok: false, reason: 'stale_revision' };
    }

    const updated = await col.findOne({ userId: input.userId, mode: input.mode });
    if (!updated) {
      return { ok: false, reason: 'stale_revision' };
    }
    return { ok: true, record: fromMongo(updated) };
  }

  async delete(userId: string, mode: GameMode): Promise<boolean> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return false;
    const col = db.collection<MongoSavedGameDoc>(COLLECTION);
    const result = await col.deleteOne({ userId, mode });
    return result.deletedCount > 0;
  }
}
