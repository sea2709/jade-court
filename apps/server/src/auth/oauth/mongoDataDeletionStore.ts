/**
 * MongoDB-backed Facebook data-deletion confirmation records.
 */
import { getDb } from '../../db.js';
import type { DataDeletionRecord, DataDeletionStore } from './dataDeletionStore.js';

const COLLECTION = 'facebook_data_deletions';

interface MongoDeletionDoc {
  confirmationCode: string;
  facebookUserId: string;
  deletedAt: Date;
}

let indexesEnsured = false;

/** Reset index bootstrap flag (Vitest only). */
export function resetMongoDataDeletionStoreForTests(): void {
  indexesEnsured = false;
}

async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const db = await getDb();
  if (!db) return;
  await db.collection(COLLECTION).createIndex({ confirmationCode: 1 }, { unique: true });
  indexesEnsured = true;
}

export class MongoDataDeletionStore implements DataDeletionStore {
  async record(entry: DataDeletionRecord): Promise<void> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) {
      throw new Error('MongoDB not configured');
    }
    const code = entry.confirmationCode.toLowerCase();
    const doc: MongoDeletionDoc = {
      confirmationCode: code,
      facebookUserId: entry.facebookUserId,
      deletedAt: entry.deletedAt,
    };
    await db
      .collection<MongoDeletionDoc>(COLLECTION)
      .updateOne({ confirmationCode: code }, { $set: doc }, { upsert: true });
  }

  async findByConfirmationCode(code: string): Promise<DataDeletionRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return null;
    const doc = await db
      .collection<MongoDeletionDoc>(COLLECTION)
      .findOne({ confirmationCode: code.trim().toLowerCase() });
    if (!doc) return null;
    return {
      confirmationCode: doc.confirmationCode,
      facebookUserId: doc.facebookUserId,
      deletedAt: doc.deletedAt,
    };
  }
}
