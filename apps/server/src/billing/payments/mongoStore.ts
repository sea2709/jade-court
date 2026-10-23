/**
 * MongoDB-backed PaymentStore — unique index on `stripeSessionId` for idempotent webhooks.
 */
import { ObjectId } from 'mongodb';
import { getDb } from '../../db.js';
import type { InsertPaymentInput, PaymentRecord } from './types.js';
import type { InsertPaymentResult, PaymentStore } from './store.js';

const COLLECTION = 'payments';

interface MongoPaymentDoc {
  _id: ObjectId;
  stripeSessionId: string;
  userId: string;
  amount: number;
  currency: string;
  grantedFrom: Date;
  grantedUntil: Date;
  receiptUrl?: string;
  status: string;
  createdAt: Date;
}

let indexesEnsured = false;

/** Reset index bootstrap flag (Vitest only). */
export function resetMongoPaymentStoreForTests(): void {
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
  const col = db.collection<MongoPaymentDoc>(COLLECTION);
  await col.createIndex({ stripeSessionId: 1 }, { unique: true });
  await col.createIndex({ userId: 1, createdAt: -1 });
  indexesEnsured = true;
}

function fromMongo(doc: MongoPaymentDoc): PaymentRecord {
  return {
    id: doc._id.toHexString(),
    stripeSessionId: doc.stripeSessionId,
    userId: doc.userId,
    amount: doc.amount,
    currency: doc.currency,
    grantedFrom: doc.grantedFrom,
    grantedUntil: doc.grantedUntil,
    ...(doc.receiptUrl ? { receiptUrl: doc.receiptUrl } : {}),
    status: doc.status as PaymentRecord['status'],
    createdAt: doc.createdAt,
  };
}

export class MongoPaymentStore implements PaymentStore {
  async insertIfNotExists(input: InsertPaymentInput): Promise<InsertPaymentResult> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) {
      throw new Error('MongoPaymentStore requires MONGODB_URI');
    }
    const col = db.collection<MongoPaymentDoc>(COLLECTION);
    const _id = new ObjectId();
    const doc: MongoPaymentDoc = {
      _id,
      stripeSessionId: input.stripeSessionId,
      userId: input.userId,
      amount: input.amount,
      currency: input.currency,
      grantedFrom: input.grantedFrom,
      grantedUntil: input.grantedUntil,
      ...(input.receiptUrl ? { receiptUrl: input.receiptUrl } : {}),
      status: input.status,
      createdAt: input.createdAt,
    };
    try {
      await col.insertOne(doc);
      return { inserted: true, payment: fromMongo(doc) };
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const existing = await col.findOne({ stripeSessionId: input.stripeSessionId });
      if (!existing) throw err;
      return { inserted: false, payment: fromMongo(existing) };
    }
  }

  async listByUserId(userId: string): Promise<PaymentRecord[]> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return [];
    const col = db.collection<MongoPaymentDoc>(COLLECTION);
    const cursor = col.find({ userId }).sort({ createdAt: -1 });
    const docs = await cursor.toArray();
    return docs.map(fromMongo);
  }
}
