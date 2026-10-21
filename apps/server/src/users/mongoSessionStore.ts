/**
 * MongoDB-backed SessionStore with TTL index on expiresAt.
 */
import { getDb } from '../db.js';
import type { SessionRecord, SessionStore } from './sessionStore.js';

const COLLECTION = 'sessions';

interface MongoSessionDoc {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

let indexesEnsured = false;

/** Reset index bootstrap flag (Vitest only). */
export function resetMongoSessionStoreForTests(): void {
  indexesEnsured = false;
}

async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const db = await getDb();
  if (!db) return;
  const col = db.collection<MongoSessionDoc>(COLLECTION);
  await col.createIndex({ tokenHash: 1 }, { unique: true });
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  indexesEnsured = true;
}

export class MongoSessionStore implements SessionStore {
  async create(record: SessionRecord): Promise<void> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) {
      throw new Error('MongoDB not configured');
    }
    await db.collection<MongoSessionDoc>(COLLECTION).insertOne({
      tokenHash: record.tokenHash,
      userId: record.userId,
      expiresAt: record.expiresAt,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return null;
    const doc = await db.collection<MongoSessionDoc>(COLLECTION).findOne({ tokenHash });
    if (!doc) return null;
    return {
      tokenHash: doc.tokenHash,
      userId: doc.userId,
      expiresAt: doc.expiresAt,
    };
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return;
    await db.collection<MongoSessionDoc>(COLLECTION).deleteOne({ tokenHash });
  }
}
