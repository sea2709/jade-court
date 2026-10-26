/**
 * MongoDB-backed UserStore — unique sparse index on email.
 */
import { ObjectId } from 'mongodb';
import { decodeNewsCursor, encodeNewsCursor } from '../news/cursor.js';
import { InvalidCursorError } from '../news/memoryStore.js';
import { getDb } from '../db.js';
import {
  EmailTakenError,
  IdentityTakenError,
  LastSignInMethodError,
  type CreateOAuthUserInput,
  type CreateUserInput,
  type UserEmailSearchOptions,
  type UserEmailSearchResult,
  type UserStore,
} from './store.js';
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
  await col.createIndex(
    { 'identities.provider': 1, 'identities.sub': 1 },
    { unique: true, sparse: true },
  );
  indexesEnsured = true;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  async createOAuthUser(input: CreateOAuthUserInput): Promise<UserRecord> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) {
      throw new Error('MongoDB not configured');
    }
    const col = db.collection<MongoUserDoc>(COLLECTION);
    const email = input.email ? normalizeEmail(input.email) : undefined;
    const now = new Date();
    const doc: MongoUserDoc = {
      _id: new ObjectId(),
      emailVerified: input.emailVerified,
      ...(email ? { email } : {}),
      ...(input.displayName ? { displayName: input.displayName.trim() } : {}),
      identities: [{ ...input.identity }],
      createdAt: now,
    };
    try {
      await col.insertOne(doc);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && (err as { code?: number }).code === 11000) {
        const keyPattern = (err as { keyPattern?: Record<string, unknown> }).keyPattern;
        if (keyPattern && 'identities.provider' in keyPattern) {
          throw new IdentityTakenError();
        }
        throw new EmailTakenError();
      }
      throw err;
    }
    return fromMongo(doc);
  }

  async findByIdentity(provider: string, sub: string): Promise<UserRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return null;
    const doc = await db.collection<MongoUserDoc>(COLLECTION).findOne({
      identities: { $elemMatch: { provider, sub } },
    });
    return doc ? fromMongo(doc) : null;
  }

  async addIdentity(userId: string, identity: UserIdentity): Promise<UserRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db || !ObjectId.isValid(userId)) return null;
    const col = db.collection<MongoUserDoc>(COLLECTION);
    const existing = await col.findOne({
      identities: { $elemMatch: { provider: identity.provider, sub: identity.sub } },
    });
    if (existing && existing._id.toHexString() !== userId) {
      throw new IdentityTakenError();
    }
    const owner = await col.findOne({ _id: new ObjectId(userId) });
    if (!owner) return null;
    if (owner.identities?.some((i) => i.provider === identity.provider)) {
      if (
        owner.identities.some((i) => i.provider === identity.provider && i.sub === identity.sub)
      ) {
        return fromMongo(owner);
      }
      throw new IdentityTakenError();
    }
    try {
      const result = await col.findOneAndUpdate(
        { _id: new ObjectId(userId) },
        { $push: { identities: { ...identity } } },
        { returnDocument: 'after' },
      );
      return result ? fromMongo(result) : null;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && (err as { code?: number }).code === 11000) {
        throw new IdentityTakenError();
      }
      throw err;
    }
  }

  async removeIdentity(userId: string, provider: string): Promise<UserRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db || !ObjectId.isValid(userId)) return null;
    const col = db.collection<MongoUserDoc>(COLLECTION);
    const owner = await col.findOne({ _id: new ObjectId(userId) });
    if (!owner) return null;
    const hasIdentity = owner.identities?.some((i) => i.provider === provider);
    if (!hasIdentity) return null;
    const methods = (owner.passwordHash ? 1 : 0) + (owner.identities?.length ?? 0);
    if (methods <= 1) {
      throw new LastSignInMethodError();
    }
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $pull: { identities: { provider } } },
      { returnDocument: 'after' },
    );
    return result ? fromMongo(result) : null;
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

  async extendAccess(userId: string, ms: number, now: Date): Promise<UserRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return null;
    if (!ObjectId.isValid(userId)) return null;
    const col = db.collection<MongoUserDoc>(COLLECTION);
    const doc = await col.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      [
        {
          $set: {
            accessUntil: {
              $dateAdd: {
                startDate: {
                  $max: [now, { $ifNull: ['$accessUntil', now] }],
                },
                unit: 'millisecond',
                amount: ms,
              },
            },
          },
        },
      ],
      { returnDocument: 'after' },
    );
    return doc ? fromMongo(doc) : null;
  }

  async ensureAccessUntilAtLeast(userId: string, until: Date): Promise<UserRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) return null;
    if (!ObjectId.isValid(userId)) return null;
    const col = db.collection<MongoUserDoc>(COLLECTION);
    const epoch = new Date(0);
    const doc = await col.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      [{ $set: { accessUntil: { $max: [{ $ifNull: ['$accessUntil', epoch] }, until] } } }],
      { returnDocument: 'after' },
    );
    return doc ? fromMongo(doc) : null;
  }

  async setEmailVerified(userId: string, emailVerified: boolean): Promise<UserRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db || !ObjectId.isValid(userId)) return null;
    const col = db.collection<MongoUserDoc>(COLLECTION);
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: { emailVerified } },
      { returnDocument: 'after' },
    );
    return result ? fromMongo(result) : null;
  }

  async setEmail(userId: string, email: string): Promise<UserRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db || !ObjectId.isValid(userId)) return null;
    const col = db.collection<MongoUserDoc>(COLLECTION);
    const normalized = normalizeEmail(email);
    const owner = await col.findOne({ _id: new ObjectId(userId) });
    if (!owner) return null;
    if (owner.email?.trim()) {
      throw new Error('already_has_email');
    }
    const taken = await col.findOne({ email: normalized });
    if (taken) {
      throw new EmailTakenError();
    }
    try {
      const result = await col.findOneAndUpdate(
        { _id: new ObjectId(userId), $or: [{ email: { $exists: false } }, { email: '' }] },
        { $set: { email: normalized, emailVerified: false } },
        { returnDocument: 'after' },
      );
      return result ? fromMongo(result) : null;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && (err as { code?: number }).code === 11000) {
        throw new EmailTakenError();
      }
      throw err;
    }
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<UserRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db || !ObjectId.isValid(userId)) return null;
    const col = db.collection<MongoUserDoc>(COLLECTION);
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: { passwordHash } },
      { returnDocument: 'after' },
    );
    return result ? fromMongo(result) : null;
  }

  async setPreferredModelId(userId: string, preferredModelId: string): Promise<UserRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db || !ObjectId.isValid(userId)) return null;
    const col = db.collection<MongoUserDoc>(COLLECTION);
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: { preferredModelId } },
      { returnDocument: 'after' },
    );
    return result ? fromMongo(result) : null;
  }

  async anonymizeUser(userId: string): Promise<boolean> {
    await ensureIndexes();
    const db = await getDb();
    if (!db || !ObjectId.isValid(userId)) return false;
    const col = db.collection<MongoUserDoc>(COLLECTION);
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      {
        $set: { emailVerified: false, identities: [] },
        $unset: {
          email: '',
          passwordHash: '',
          displayName: '',
          preferredModelId: '',
          accessUntil: '',
        },
      },
      { returnDocument: 'after' },
    );
    return Boolean(result);
  }

  async searchByEmail(options: UserEmailSearchOptions): Promise<UserEmailSearchResult> {
    await ensureIndexes();
    const db = await getDb();
    if (!db) {
      return { users: [], nextCursor: null };
    }
    const q = options.q.trim();
    const re = new RegExp(escapeRegex(q), 'i');
    const clauses: Record<string, unknown>[] = [{ email: re }];
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
          { createdAt: { $lt: decoded.sortAt } },
          { createdAt: decoded.sortAt, _id: { $lt: cursorId } },
        ],
      });
    }
    const mongoFilter = clauses.length === 1 ? clauses[0]! : { $and: clauses };
    const limit = options.limit;
    const col = db.collection<MongoUserDoc>(COLLECTION);
    const docs = await col
      .find(mongoFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .toArray();
    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeNewsCursor(last.createdAt, last._id.toHexString()) : null;
    return { users: page.map(fromMongo), nextCursor };
  }

  async revokeAccess(userId: string): Promise<UserRecord | null> {
    await ensureIndexes();
    const db = await getDb();
    if (!db || !ObjectId.isValid(userId)) return null;
    const col = db.collection<MongoUserDoc>(COLLECTION);
    const result = await col.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $unset: { accessUntil: '' } },
      { returnDocument: 'after' },
    );
    return result ? fromMongo(result) : null;
  }
}
