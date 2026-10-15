/**
 * Admin news curation API (`/api/admin/news/*`), Bearer session-protected.
 */
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { adminAuth } from '../middleware/adminAuth.js';
import {
  NEWS_IMAGE_MAX_BYTES,
  NEWS_IMAGE_UPLOAD_MAX_BODY_BYTES,
  sniffImageType,
  uploadedImageFilename,
  type NewsImageStorage,
} from '../news/imageStorage.js';
import {
  BlockedUrlError,
  fetchPageMetadata,
  InvalidMetadataUrlError,
  MetadataFetchFailedError,
  normalizedUrlForPreview,
} from '../news/metadata.js';
import { InvalidCursorError, NotFoundError } from '../news/memoryStore.js';
import type { NewsStore, NormalizedUpdateFields } from '../news/store.js';
import { NewsDuplicateError, NEWS_STATUSES, toAdminNewsItem } from '../news/types.js';
import type { UpdateNewsInput } from '../news/types.js';
import {
  validateCreateInput,
  validatePreviewUrl,
  validateUpdateInput,
  type NormalizedNewsPayload,
} from '../news/validate.js';

const ADMIN_PAGE_SIZE = 50;

function noStore(c: { header: (name: string, value: string) => void }) {
  c.header('Cache-Control', 'no-store');
}

/** Unlink only when no news item still references the hosted path (errors are logged, never thrown). */
async function tryRemoveUploadedImageIfUnreferenced(
  store: NewsStore,
  storage: NewsImageStorage | null,
  imageUrl: string | undefined,
  excludeId?: string,
): Promise<void> {
  try {
    if (!storage || !imageUrl) return;
    const file = uploadedImageFilename(imageUrl);
    if (!file) return;
    const refs = await store.countByImageUrl(imageUrl, excludeId);
    if (refs > 0) return;
    await storage.remove(file);
  } catch (err) {
    console.warn('news image cleanup failed', err);
  }
}

/** Map validated merge onto only fields present in the PATCH body. */
function patchFieldsFromBody(
  body: Record<string, unknown>,
  data: NormalizedNewsPayload,
): UpdateNewsInput & NormalizedUpdateFields {
  const patch: UpdateNewsInput & NormalizedUpdateFields = {};

  if (body.sourceUrl !== undefined) {
    patch.sourceUrl = data.sourceUrl;
    patch.normalizedUrl = data.normalizedUrl;
    patch.sourceDomain = data.sourceDomain;
  }
  if (body.title !== undefined) patch.title = data.title;
  if (body.summary !== undefined) patch.summary = data.summary;
  if (body.publisher !== undefined) patch.publisher = data.publisher;
  if (body.tags !== undefined) patch.tags = data.tags;
  if (body.status !== undefined) patch.status = data.status;
  if (body.publishedAt !== undefined) {
    patch.publishedAt = data.publishedAt ?? null;
  }
  if (body.imageUrl !== undefined) {
    patch.imageUrl = data.imageUrl ?? null;
  }

  return patch;
}

/** Build admin news routes; requires a configured store after auth. */
export function createAdminNewsRoutes(
  newsStore: NewsStore | null,
  newsImageStorage: NewsImageStorage | null,
) {
  const routes = new Hono();

  routes.use('*', async (c, next) => {
    noStore(c);
    await next();
  });

  routes.use('*', adminAuth);

  routes.use('*', async (c, next) => {
    if (!newsStore) {
      noStore(c);
      return c.json({ error: 'news_storage_unavailable' }, 503);
    }
    await next();
  });

  routes.get('/', async (c) => {
    const store = newsStore!;
    const statusRaw = c.req.query('status');
    let status: (typeof NEWS_STATUSES)[number] | undefined;
    if (statusRaw) {
      if (!NEWS_STATUSES.includes(statusRaw as (typeof NEWS_STATUSES)[number])) {
        return c.json({ error: 'validation', fields: { status: 'invalid status' } }, 400);
      }
      status = statusRaw as (typeof NEWS_STATUSES)[number];
    }

    const q = c.req.query('q') || undefined;
    const cursor = c.req.query('cursor') || undefined;

    try {
      const result = await store.listAdmin({
        limit: ADMIN_PAGE_SIZE,
        cursor,
        status,
        q,
      });
      return c.json(result);
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        return c.json({ error: 'invalid_cursor' }, 400);
      }
      throw err;
    }
  });

  routes.post(
    '/images',
    bodyLimit({
      maxSize: NEWS_IMAGE_UPLOAD_MAX_BODY_BYTES,
      onError: (c) => c.json({ error: 'image_too_large' }, 413),
    }),
    async (c) => {
      if (!newsImageStorage) {
        return c.json({ error: 'news_storage_unavailable' }, 503);
      }

      let body: Record<string, unknown>;
      try {
        body = await c.req.parseBody({ all: false });
      } catch {
        return c.json({ error: 'invalid_image' }, 400);
      }

      const fileField = body.file;
      if (!(fileField instanceof File)) {
        return c.json({ error: 'invalid_image' }, 400);
      }

      const bytes = new Uint8Array(await fileField.arrayBuffer());
      if (bytes.length > NEWS_IMAGE_MAX_BYTES) {
        return c.json({ error: 'image_too_large' }, 413);
      }
      if (bytes.length === 0) {
        return c.json({ error: 'invalid_image' }, 400);
      }

      const ext = sniffImageType(bytes);
      if (!ext) {
        return c.json({ error: 'invalid_image' }, 400);
      }

      const saved = await newsImageStorage.save(bytes, ext);
      return c.json({ imageUrl: `/api/news/images/${saved}` }, 201);
    },
  );

  routes.post('/preview', async (c) => {
    const store = newsStore!;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_url' }, 400);
    }

    const parsed = validatePreviewUrl(body);
    if (!parsed.ok) {
      return c.json({ error: 'invalid_url' }, 400);
    }

    try {
      const meta = await fetchPageMetadata(parsed.url);
      const norm = normalizedUrlForPreview(meta.canonicalUrl, parsed.url);
      let duplicateOf: { id: string; title: string; status: string } | undefined;
      if (norm) {
        const existing = await store.findByNormalizedUrl(norm);
        if (existing) {
          duplicateOf = { id: existing.id, title: existing.title, status: existing.status };
        }
      }

      return c.json({
        title: meta.title,
        description: meta.description,
        imageUrl: meta.imageUrl,
        publisher: meta.publisher,
        publishedAt: meta.publishedAt,
        canonicalUrl: meta.canonicalUrl,
        ...(duplicateOf ? { duplicateOf } : {}),
      });
    } catch (err) {
      if (err instanceof InvalidMetadataUrlError) {
        return c.json({ error: 'invalid_url' }, 400);
      }
      if (err instanceof BlockedUrlError) {
        return c.json({ error: 'blocked_url' }, 400);
      }
      if (err instanceof MetadataFetchFailedError) {
        return c.json({ error: 'fetch_failed' }, 502);
      }
      throw err;
    }
  });

  routes.post('/', async (c) => {
    const store = newsStore!;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'validation', fields: { body: 'invalid JSON' } }, 400);
    }

    const validated = validateCreateInput(body);
    if (!validated.ok) {
      return c.json({ error: 'validation', fields: validated.fields }, 400);
    }

    try {
      const doc = await store.create({
        sourceUrl: validated.data.sourceUrl,
        normalizedUrl: validated.data.normalizedUrl,
        sourceDomain: validated.data.sourceDomain,
        title: validated.data.title,
        summary: validated.data.summary,
        publisher: validated.data.publisher,
        publishedAt: validated.data.publishedAt,
        imageUrl: validated.data.imageUrl,
        tags: validated.data.tags,
        status: validated.data.status,
      });
      return c.json(toAdminNewsItem(doc), 201);
    } catch (err) {
      if (err instanceof NewsDuplicateError) {
        return c.json({ error: 'duplicate', existing: err.existing }, 409);
      }
      throw err;
    }
  });

  routes.patch('/:id', async (c) => {
    const store = newsStore!;
    const id = c.req.param('id');
    const existing = await store.get(id);
    if (!existing) {
      return c.json({ error: 'not_found' }, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'validation', fields: { body: 'invalid JSON' } }, 400);
    }

    const validated = validateUpdateInput(body, existing);
    if (!validated.ok) {
      return c.json({ error: 'validation', fields: validated.fields }, 400);
    }

    const patchBody = body as Record<string, unknown>;
    const patchInput = patchFieldsFromBody(patchBody, validated.data);
    const imageUrlInPatch = patchBody.imageUrl !== undefined;
    const prevImageUrl = existing.imageUrl;
    const nextImageUrl = imageUrlInPatch ? validated.data.imageUrl : existing.imageUrl;

    try {
      const doc = await store.update(id, patchInput);
      if (imageUrlInPatch && prevImageUrl && prevImageUrl !== nextImageUrl) {
        await tryRemoveUploadedImageIfUnreferenced(store, newsImageStorage, prevImageUrl, id);
      }
      return c.json(toAdminNewsItem(doc));
    } catch (err) {
      if (err instanceof NewsDuplicateError) {
        return c.json({ error: 'duplicate', existing: err.existing }, 409);
      }
      if (err instanceof NotFoundError) {
        return c.json({ error: 'not_found' }, 404);
      }
      throw err;
    }
  });

  routes.delete('/:id', async (c) => {
    const store = newsStore!;
    const id = c.req.param('id');
    const existing = await store.get(id);
    if (!existing) {
      return c.json({ error: 'not_found' }, 404);
    }
    const removed = await store.remove(id);
    if (!removed) {
      return c.json({ error: 'not_found' }, 404);
    }
    await tryRemoveUploadedImageIfUnreferenced(store, newsImageStorage, existing.imageUrl);
    return c.body(null, 204);
  });

  return routes;
}
