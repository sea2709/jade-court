import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
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

function adminHeaders(token?: string) {
  const bearer = token ?? createSessionToken(ADMIN_USER).token;
  return {
    Authorization: `Bearer ${bearer}`,
    'Content-Type': 'application/json',
    'x-guest-id': 'guest-news-test',
  };
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
});
