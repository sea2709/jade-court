import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;

let client: MongoClient | null = null;

export async function getDb() {
  if (!uri) return null;
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
  }
  return client.db(process.env.MONGODB_DB ?? 'jade_court');
}

/** Persist finished online room games when MongoDB is configured. */
export async function saveFinishedGame(doc: {
  code?: string;
  redGuestId?: string;
  blackGuestId?: string;
  history: unknown[];
  status: string;
  endedAt: Date;
}) {
  const db = await getDb();
  if (!db) return;
  await db.collection('games').insertOne(doc);
}

/** Persist a finished pvc / ai game for a registered user. */
export async function saveUserFinishedGame(doc: {
  userId: string;
  mode: 'pvc' | 'ai';
  config: unknown;
  moves: unknown[];
  status: string;
  endedAt: Date;
}) {
  const db = await getDb();
  if (!db) return;
  await db.collection('games').insertOne(doc);
}
