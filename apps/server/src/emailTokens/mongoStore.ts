/**
 * MongoDB EmailTokenStore with TTL index on expiresAt.
 */
import { getDb } from '../db.js';
import type { EmailTokenKind, EmailTokenRecord, EmailTokenStore } from './store.js';

const COLLECTION = 'emailTokens';

interface MongoEmailTokenDoc {
  tokenHash: string;
  userId: string;
  kind: EmailTokenKind;
  expiresAt: Date;
}

let indexesEnsured = false;

/** Reset index bootstrap flag (Vitest only). */
export function resetMongoEmailTokenStoreForTests(): void {
  indexesEnsured = false;
}

async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const db = await getDb();
  if (!db) return;
  const col = db.collection<MongoEmailTokenDoc>(COLLECTION);
  await col.createIndex({ tokenHash: 1 }, { unique: true });
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  indexesEnsured = true;
}

export class MongoEmailTokenStore implements EmailTokenStore {
  async create(record: EmailTokenRecord): Promise<void> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) {
      throw new Error('MongoDB not configured');
    }
    await db.collection<MongoEmailTokenDoc>(COLLECTION).insertOne({
      tokenHash: record.tokenHash,
      userId: record.userId,
      kind: record.kind,
      expiresAt: record.expiresAt,
    });
  }

  async findByTokenHash(tokenHash: string, now = new Date()): Promise<EmailTokenRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return null;
    const doc = await db.collection<MongoEmailTokenDoc>(COLLECTION).findOne({
      tokenHash,
      expiresAt: { $gt: now },
    });
    if (!doc) return null;
    return {
      tokenHash: doc.tokenHash,
      userId: doc.userId,
      kind: doc.kind,
      expiresAt: doc.expiresAt,
    };
  }

  async consumeByTokenHash(tokenHash: string, now = new Date()): Promise<EmailTokenRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return null;
    const col = db.collection<MongoEmailTokenDoc>(COLLECTION);
    const doc = await col.findOneAndDelete({
      tokenHash,
      expiresAt: { $gt: now },
    });
    if (!doc) return null;
    return {
      tokenHash: doc.tokenHash,
      userId: doc.userId,
      kind: doc.kind,
      expiresAt: doc.expiresAt,
    };
  }

  async deleteByUserIdAndKind(userId: string, kind: EmailTokenKind): Promise<void> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return;
    await db.collection<MongoEmailTokenDoc>(COLLECTION).deleteMany({ userId, kind });
  }
}
