/**
 * Public curated news feed (`GET /api/news`) and hosted thumbnail images.
 */
import { Hono } from 'hono';
import { InvalidCursorError } from '../news/memoryStore.js';
import type { NewsImageStorage } from '../news/imageStorage.js';
import { UPLOADED_IMAGE_FILENAME_RE } from '../news/imageStorage.js';
import type { NewsStore } from '../news/store.js';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 12;

/** Build public news routes; when store is null, returns an empty feed. */
export function createNewsRoutes(
  newsStore: NewsStore | null,
  newsImageStorage: NewsImageStorage | null,
) {
  const routes = new Hono();

  routes.get('/images/:file', async (c) => {
    if (!newsImageStorage) {
      return c.body(null, 404);
    }
    const file = c.req.param('file');
    if (!UPLOADED_IMAGE_FILENAME_RE.test(file)) {
      return c.body(null, 404);
    }
    const result = await newsImageStorage.read(file);
    if (!result) {
      return c.body(null, 404);
    }
    return c.newResponse(Buffer.from(result.bytes), 200, {
      'Content-Type': result.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  });

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
