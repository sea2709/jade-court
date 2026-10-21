/**
 * MongoDB-backed UserStore — unique sparse index on email.
 */
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { EmailTakenError, type CreateUserInput, type UserStore } from './store.js';
import type { UserIdentity, UserRecord } from './types.js';

const COLLECTION = 'users';

interface MongoUserDoc {
  _id: ObjectId;
  email?: string;
  emailVerified: boolean;
  passwordHash?: string;
  displayName?: string;
  identities: UserIdentity[];
  accessUntil?: Date;
  preferredModelId?: string;
  createdAt: Date;
}

let indexesEnsured = false;

/** Reset index bootstrap flag (Vitest only). */
export function resetMongoUserStoreForTests(): void {
  indexesEnsured = false;
}

async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const db = await getDb();
  if (!db) return;
  const col = db.collection<MongoUserDoc>(COLLECTION);
  await col.createIndex({ email: 1 }, { unique: true, sparse: true });
  indexesEnsured = true;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function fromMongo(doc: MongoUserDoc): UserRecord {
  return {
    id: doc._id.toHexString(),
    ...(doc.email !== undefined ? { email: doc.email } : {}),
    emailVerified: doc.emailVerified,
    ...(doc.passwordHash !== undefined ? { passwordHash: doc.passwordHash } : {}),
    ...(doc.displayName !== undefined ? { displayName: doc.displayName } : {}),
    identities: doc.identities ?? [],
    ...(doc.accessUntil ? { accessUntil: doc.accessUntil } : {}),
    ...(doc.preferredModelId ? { preferredModelId: doc.preferredModelId } : {}),
    createdAt: doc.createdAt,
  };
}

export class MongoUserStore implements UserStore {
  async create(input: CreateUserInput): Promise<UserRecord> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) {
      throw new Error('MongoDB not configured');
    }
    const col = db.collection<MongoUserDoc>(COLLECTION);
    const email = normalizeEmail(input.email);
    const now = new Date();
    const doc: MongoUserDoc = {
      _id: new ObjectId(),
      email,
      emailVerified: false,
      passwordHash: input.passwordHash,
      ...(input.displayName ? { displayName: input.displayName.trim() } : {}),
      identities: [],
      createdAt: now,
    };
    try {
      await col.insertOne(doc);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && (err as { code?: number }).code === 11000) {
        throw new EmailTakenError();
      }
      throw err;
    }
    return fromMongo(doc);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return null;
    const doc = await db.collection<MongoUserDoc>(COLLECTION).findOne({
      email: normalizeEmail(email),
    });
    return doc ? fromMongo(doc) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return null;
    if (!ObjectId.isValid(id)) return null;
    const doc = await db.collection<MongoUserDoc>(COLLECTION).findOne({ _id: new ObjectId(id) });
    return doc ? fromMongo(doc) : null;
  }
}
