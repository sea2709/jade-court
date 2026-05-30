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

/** Persist finished games when MongoDB is configured. */
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
