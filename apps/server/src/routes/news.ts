/**
 * Public curated news feed (`GET /api/news`).
 */
import { Hono } from 'hono';
import { InvalidCursorError } from '../news/memoryStore.js';
import type { NewsStore } from '../news/store.js';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 12;

/** Build public news routes; when store is null, returns an empty feed. */
export function createNewsRoutes(newsStore: NewsStore | null) {
  const routes = new Hono();

  routes.get('/', async (c) => {
    if (!newsStore) {
      return c.json({ items: [], nextCursor: null });
    }

    const cursor = c.req.query('cursor') || undefined;
    let limit = Number(c.req.query('limit') ?? DEFAULT_LIMIT);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    try {
      const result = await newsStore.list({ limit, cursor });
      return c.json(result);
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        return c.json({ error: 'invalid_cursor' }, 400);
      }
      throw err;
    }
  });

  return routes;
}
