import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { MemoryNewsImageStorage, NEWS_IMAGE_MAX_BYTES } from '../news/imageStorage.js';
import { MemoryNewsStore } from '../news/memoryStore.js';
import type { NewsDocument } from '../news/types.js';
import { createSessionToken } from '../admin/session.js';
import { resetAdminAuthRateLimitsForTests } from '../middleware/adminAuth.js';
import type * as Metadata from '../news/metadata.js';

const metadata = vi.hoisted(() => ({
  fetchPageMetadata: vi.fn<typeof Metadata.fetchPageMetadata>(),
}));

vi.mock('../news/metadata.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Metadata>();
  return {
    ...actual,
    fetchPageMetadata: metadata.fetchPageMetadata,
  };
});

const ADMIN_USER = 'news-admin';
const ADMIN_PASS = 'news-admin-pass';
const ADMIN_SECRET = 'test-session-secret-0123456789abcdef0123456789ab';

function seedDoc(overrides: Partial<NewsDocument> & { id: string }): NewsDocument {
  const sortAt = overrides.sortAt ?? new Date('2024-03-01T00:00:00Z');
  return {
    sourceUrl: `https://example.com/${overrides.id}`,
    normalizedUrl: `https://example.com/${overrides.id}`,
    title: 'Published headline for card',
    summary: 'Curator summary that is at least twenty characters long.',
    publisher: 'Example Pub',
    sourceDomain: 'example.com',
    tags: ['culture'],
    status: 'published',
    createdAt: sortAt,
    updatedAt: sortAt,
    sortAt,
    ...overrides,
  };
}

/** Minimal valid 1×1 PNG. */
const TINY_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function adminHeaders(token?: string) {
  const bearer = token ?? createSessionToken(ADMIN_USER).token;
  return {
    Authorization: `Bearer ${bearer}`,
    'Content-Type': 'application/json',
    'x-guest-id': 'guest-news-test',
  };
}

function adminAuthHeaders(token?: string) {
  const bearer = token ?? createSessionToken(ADMIN_USER).token;
  return {
    Authorization: `Bearer ${bearer}`,
    'x-guest-id': 'guest-news-test',
  };
}

function testApp(store: MemoryNewsStore, imageStore = new MemoryNewsImageStorage()) {
  return createApp({ newsStore: store, newsImageStorage: imageStore });
}

function pngBytesOfLength(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  buf.set(TINY_PNG.subarray(0, Math.min(TINY_PNG.length, length)));
  return buf;
}

async function uploadPng(
  app: ReturnType<typeof createApp>,
  bytes: Uint8Array,
  filename = 'thumb.png',
) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/png' }), filename);
  return app.request('/api/admin/news/images', {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: form,
  });
}

describe('news API routes', () => {
  beforeEach(() => {
    process.env.ADMIN_USERS = `${ADMIN_USER}:${ADMIN_PASS}`;
    process.env.ADMIN_SESSION_SECRET = ADMIN_SECRET;
    resetAdminAuthRateLimitsForTests();
    metadata.fetchPageMetadata.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.ADMIN_USERS;
    delete process.env.ADMIN_SESSION_SECRET;
    vi.restoreAllMocks();
  });

  it('GET /api/news returns published items only with public fields', async () => {
    const store = new MemoryNewsStore([
      seedDoc({ id: 'pub-1', status: 'published' }),
      seedDoc({ id: 'draft-1', status: 'draft', sortAt: new Date('2025-01-01T00:00:00Z') }),
    ]);
    const app = createApp({ newsStore: store });

    const res = await app.request('/api/news');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Record<string, unknown>[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: 'pub-1',
      sourceUrl: expect.any(String),
      title: expect.any(String),
      summary: expect.any(String),
      publisher: expect.any(String),
      sourceDomain: 'example.com',
      sortAt: expect.any(String),
      tags: ['culture'],
    });
    expect(body.items[0]).not.toHaveProperty('normalizedUrl');
    expect(body.items[0]).not.toHaveProperty('status');
  });

  it('caps limit at 12 and paginates with nextCursor', async () => {
    const store = new MemoryNewsStore(
      Array.from({ length: 15 }, (_, i) =>
        seedDoc({
          id: `p-${i}`,
          sortAt: new Date(Date.UTC(2024, 0, 15 - i)),
        }),
      ),
    );
    const app = createApp({ newsStore: store });

    const res = await app.request('/api/news?limit=100');
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null };
    expect(body.items).toHaveLength(12);
    expect(body.nextCursor).toBeTruthy();
  });

  it('returns empty list when newsStore is null', async () => {
    const app = createApp({ newsStore: null });
    const res = await app.request('/api/news');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('returns 400 for invalid cursor', async () => {
    const app = createApp({ newsStore: new MemoryNewsStore([seedDoc({ id: 'x' })]) });
    const res = await app.request('/api/news?cursor=bad');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_cursor' });
  });

  it('allows Authorization in CORS preflight', async () => {
    const app = createApp({ newsStore: new MemoryNewsStore() });
    const res = await app.request('/api/admin/news', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization',
      },
    });
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'authorization',
    );
  });

  it('admin routes return 401 without token and Cache-Control no-store', async () => {
    const app = createApp({ newsStore: new MemoryNewsStore() });
    const res = await app.request('/api/admin/news');
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('admin returns 503 when store is null after auth', async () => {
    const app = createApp({ newsStore: null });
    const res = await app.request('/api/admin/news', { headers: adminHeaders() });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'news_storage_unavailable' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('creates draft with sourceUrl only and validates publish', async () => {
    const app = createApp({ newsStore: new MemoryNewsStore() });

    const draft = await app.request('/api/admin/news', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ sourceUrl: 'https://news.example.com/article' }),
    });
    expect(draft.status).toBe(201);
    const draftBody = (await draft.json()) as { id: string; status: string };
    expect(draftBody.status).toBe('draft');

    const badPublish = await app.request(`/api/admin/news/${draftBody.id}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ status: 'published' }),
    });
    expect(badPublish.status).toBe(400);
    expect(await badPublish.json()).toMatchObject({
      error: 'validation',
      fields: expect.any(Object),
    });
  });

  it('returns 409 on duplicate normalized URL', async () => {
    const store = new MemoryNewsStore();
    const app = createApp({ newsStore: store });

    await app.request('/api/admin/news', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ sourceUrl: 'https://ex.com/s?utm_source=x' }),
    });

    const dup = await app.request('/api/admin/news', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ sourceUrl: 'https://ex.com/s?fbclid=y' }),
    });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ error: 'duplicate', existing: expect.any(Object) });
  });

  it('preview returns duplicateOf when URL exists', async () => {
    const store = new MemoryNewsStore([
      seedDoc({ id: 'existing-1', normalizedUrl: 'https://canonical.example.com/page' }),
    ]);
    const app = createApp({ newsStore: store });

    metadata.fetchPageMetadata.mockResolvedValue({
      title: 'T',
      description: 'D',
      imageUrl: null,
      publisher: 'P',
      publishedAt: null,
      canonicalUrl: 'https://canonical.example.com/page',
    });

    const res = await app.request('/api/admin/news/preview', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ url: 'https://other.example.com' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicateOf).toMatchObject({ id: 'existing-1' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('hard deletes with 204', async () => {
    const store = new MemoryNewsStore([seedDoc({ id: 'del-1', status: 'archived' })]);
    const app = createApp({ newsStore: store });

    const res = await app.request('/api/admin/news/del-1', {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(res.status).toBe(204);
    expect(await store.get('del-1')).toBeNull();
  });

  it('returns 404 for unknown admin patch and delete', async () => {
    const app = createApp({ newsStore: new MemoryNewsStore() });

    const patch = await app.request('/api/admin/news/missing', {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ title: 'x' }),
    });
    expect(patch.status).toBe(404);

    const del = await app.request('/api/admin/news/missing', {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(del.status).toBe(404);
  });

  it('POST /api/admin/news/images returns 401 without session', async () => {
    const app = testApp(new MemoryNewsStore());
    const form = new FormData();
    form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'x.png');
    const res = await app.request('/api/admin/news/images', { method: 'POST', body: form });
    expect(res.status).toBe(401);
  });

  it('rejects invalid image type and oversize upload', async () => {
    const app = testApp(new MemoryNewsStore());
    const bad = new FormData();
    bad.append(
      'file',
      new Blob([new TextEncoder().encode('not-image')], { type: 'image/png' }),
      'x.png',
    );
    const badRes = await app.request('/api/admin/news/images', {
      method: 'POST',
      headers: adminAuthHeaders(),
      body: bad,
    });
    expect(badRes.status).toBe(400);
    expect(await badRes.json()).toEqual({ error: 'invalid_image' });

    const bigRes = await uploadPng(app, pngBytesOfLength(NEWS_IMAGE_MAX_BYTES + 1));
    expect(bigRes.status).toBe(413);
    expect(await bigRes.json()).toEqual({ error: 'image_too_large' });
  });

  it('accepts uploads at 2 MiB - 1 and exactly 2 MiB file bytes', async () => {
    const app = testApp(new MemoryNewsStore());

    const under = await uploadPng(app, pngBytesOfLength(NEWS_IMAGE_MAX_BYTES - 1));
    expect(under.status).toBe(201);

    const exact = await uploadPng(app, pngBytesOfLength(NEWS_IMAGE_MAX_BYTES));
    expect(exact.status).toBe(201);
  });

  it('uploads, serves with cache headers, and rejects bad filenames', async () => {
    const imageStore = new MemoryNewsImageStorage();
    const app = testApp(new MemoryNewsStore(), imageStore);

    const form = new FormData();
    form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'thumb.png');
    const up = await app.request('/api/admin/news/images', {
      method: 'POST',
      headers: adminAuthHeaders(),
      body: form,
    });
    expect(up.status).toBe(201);
    const { imageUrl } = (await up.json()) as { imageUrl: string };
    expect(imageUrl).toMatch(/^\/api\/news\/images\/[0-9a-f-]+\.png$/i);

    const file = imageUrl.replace('/api/news/images/', '');
    const get = await app.request(`/api/news/images/${file}`);
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toBe('image/png');
    expect(get.headers.get('x-content-type-options')).toBe('nosniff');
    expect(get.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

    const trav = await app.request('/api/news/images/../evil.png');
    expect(trav.status).toBe(404);
    const badName = await app.request('/api/news/images/not-a-uuid.png');
    expect(badName.status).toBe(404);
  });

  it('saves item with uploaded imageUrl and cleans up on replace and delete', async () => {
    const imageStore = new MemoryNewsImageStorage();
    const app = testApp(new MemoryNewsStore(), imageStore);

    const form = new FormData();
    form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'thumb.png');
    const up = await app.request('/api/admin/news/images', {
      method: 'POST',
      headers: adminAuthHeaders(),
      body: form,
    });
    const { imageUrl } = (await up.json()) as { imageUrl: string };
    const file = imageUrl.replace('/api/news/images/', '');
    expect(imageStore.has(file)).toBe(true);

    const create = await app.request('/api/admin/news', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        sourceUrl: 'https://example.com/uploaded-thumb',
        imageUrl,
        status: 'draft',
      }),
    });
    expect(create.status).toBe(201);
    const { id } = (await create.json()) as { id: string };

    const patch = await app.request(`/api/admin/news/${id}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ imageUrl: 'https://cdn.example.com/new.jpg' }),
    });
    expect(patch.status).toBe(200);
    expect(imageStore.has(file)).toBe(false);

    const form2 = new FormData();
    form2.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'thumb2.png');
    const up2 = await app.request('/api/admin/news/images', {
      method: 'POST',
      headers: adminAuthHeaders(),
      body: form2,
    });
    const { imageUrl: imageUrl2 } = (await up2.json()) as { imageUrl: string };
    const file2 = imageUrl2.replace('/api/news/images/', '');

    await app.request(`/api/admin/news/${id}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ imageUrl: imageUrl2 }),
    });
    expect(imageStore.has(file2)).toBe(true);

    const del = await app.request(`/api/admin/news/${id}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(del.status).toBe(204);
    expect(imageStore.has(file2)).toBe(false);
  });

  it('does not delete shared uploaded path while another item still references it', async () => {
    const imageStore = new MemoryNewsImageStorage();
    const app = testApp(new MemoryNewsStore(), imageStore);

    const up = await uploadPng(app, TINY_PNG);
    const { imageUrl } = (await up.json()) as { imageUrl: string };
    const file = imageUrl.replace('/api/news/images/', '');

    const createA = await app.request('/api/admin/news', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ sourceUrl: 'https://example.com/a', imageUrl, status: 'draft' }),
    });
    const { id: idA } = (await createA.json()) as { id: string };

    const createB = await app.request('/api/admin/news', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ sourceUrl: 'https://example.com/b', imageUrl, status: 'draft' }),
    });
    const { id: idB } = (await createB.json()) as { id: string };

    const delA = await app.request(`/api/admin/news/${idA}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(delA.status).toBe(204);
    expect(imageStore.has(file)).toBe(true);

    const get = await app.request(`/api/news/images/${file}`);
    expect(get.status).toBe(200);

    await app.request(`/api/admin/news/${idB}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ imageUrl: 'https://cdn.example.com/other.jpg' }),
    });
    expect(imageStore.has(file)).toBe(false);
  });

  it('PATCH and DELETE succeed when image cleanup fails after commit', async () => {
    class CleanupFailStore extends MemoryNewsStore {
      override async countByImageUrl(): Promise<number> {
        throw new Error('count unavailable');
      }
    }

    const imageStore = new MemoryNewsImageStorage();
    const store = new CleanupFailStore();
    const app = testApp(store, imageStore);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const up = await uploadPng(app, TINY_PNG);
    const { imageUrl } = (await up.json()) as { imageUrl: string };

    const create = await app.request('/api/admin/news', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        sourceUrl: 'https://example.com/cleanup-fail',
        imageUrl,
        status: 'draft',
      }),
    });
    const { id } = (await create.json()) as { id: string };

    const patch = await app.request(`/api/admin/news/${id}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ imageUrl: 'https://cdn.example.com/replace.jpg' }),
    });
    expect(patch.status).toBe(200);

    const del = await app.request(`/api/admin/news/${id}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(del.status).toBe(204);
    expect(warn).toHaveBeenCalled();
  });

  it('title-only PATCH does not restore a replaced uploaded imageUrl', async () => {
    const imageStore = new MemoryNewsImageStorage();
    const app = testApp(new MemoryNewsStore(), imageStore);

    const upX = await uploadPng(app, TINY_PNG, 'x.png');
    const { imageUrl: imageUrlX } = (await upX.json()) as { imageUrl: string };
    const fileX = imageUrlX.replace('/api/news/images/', '');

    const upY = await uploadPng(app, TINY_PNG, 'y.png');
    const { imageUrl: imageUrlY } = (await upY.json()) as { imageUrl: string };

    const create = await app.request('/api/admin/news', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        sourceUrl: 'https://example.com/race',
        imageUrl: imageUrlX,
        status: 'draft',
      }),
    });
    const { id } = (await create.json()) as { id: string };

    const swap = await app.request(`/api/admin/news/${id}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ imageUrl: imageUrlY }),
    });
    expect(swap.status).toBe(200);

    const titleOnly = await app.request(`/api/admin/news/${id}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ title: 'Updated headline for race test' }),
    });
    expect(titleOnly.status).toBe(200);
    const body = (await titleOnly.json()) as { imageUrl?: string };
    expect(body.imageUrl).toBe(imageUrlY);
    expect(imageStore.has(fileX)).toBe(false);
  });
});
