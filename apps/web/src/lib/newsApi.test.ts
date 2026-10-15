import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_SESSION_STORAGE_KEY, setAdminSession } from './adminApi';
import {
  createAdminNewsItem,
  deleteAdminNewsItem,
  fetchAdminNews,
  fetchPublicNews,
  patchAdminNewsItem,
  NewsApiError,
  previewAdminNewsUrl,
  resolveNewsImageUrl,
  uploadAdminNewsImage,
} from './newsApi';

const fetchMock = vi.fn<typeof fetch>();

const futureExpiry = () => new Date(Date.now() + 60_000).toISOString();

function storeAdminToken(token: string) {
  setAdminSession({ token, username: 'admin', expiresAt: futureExpiry() });
}

beforeEach(() => {
  localStorage.setItem('jade-court-guest-id', 'guest-123');
  sessionStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('fetchPublicNews', () => {
  it('GETs /api/news with guest header', async () => {
    fetchMock.mockResolvedValue(json({ items: [], nextCursor: null }));
    await fetchPublicNews();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/news');
    expect(init?.headers).toMatchObject({
      'x-guest-id': 'guest-123',
      'Content-Type': 'application/json',
    });
  });

  it('passes cursor query params', async () => {
    fetchMock.mockResolvedValue(json({ items: [], nextCursor: null }));
    await fetchPublicNews({ cursor: 'abc', limit: 12 });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/news?cursor=abc&limit=12');
  });

  it('does not clear the admin session on 401', async () => {
    storeAdminToken('keep-me');
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    await expect(fetchPublicNews()).rejects.toBeInstanceOf(NewsApiError);
    expect(sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY)).not.toBeNull();
  });
});

describe('admin news API', () => {
  it('sends Authorization bearer on admin requests', async () => {
    storeAdminToken('secret-token');
    fetchMock.mockResolvedValue(json({ items: [], nextCursor: null }));
    await fetchAdminNews();
    expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({
      Authorization: 'Bearer secret-token',
    });
  });

  it('clears stored session on 401', async () => {
    storeAdminToken('bad');
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    await expect(fetchAdminNews()).rejects.toBeInstanceOf(NewsApiError);
    expect(sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('throws NewsApiError with validation fields', async () => {
    storeAdminToken('ok');
    fetchMock.mockResolvedValue(json({ error: 'validation', fields: { title: 'Too short' } }, 400));
    await expect(createAdminNewsItem({ sourceUrl: 'https://a.com/x' })).rejects.toMatchObject({
      code: 'validation',
      fields: { title: 'Too short' },
    });
  });

  it('PATCHes an admin item', async () => {
    storeAdminToken('ok');
    fetchMock.mockResolvedValue(json({ id: 'id-1', status: 'published' }));
    await patchAdminNewsItem('id-1', { status: 'published' });
    expect(fetchMock.mock.calls[0]![1]?.method).toBe('PATCH');
  });

  it('DELETEs an admin item', async () => {
    storeAdminToken('ok');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await deleteAdminNewsItem('id-1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/news/id-1');
    expect(init?.method).toBe('DELETE');
  });

  it('uploads thumbnail via FormData without Content-Type', async () => {
    storeAdminToken('ok');
    const uploadedPath = '/api/news/images/550e8400-e29b-41d4-a716-446655440000.png';
    fetchMock.mockResolvedValue(json({ imageUrl: uploadedPath }, 201));
    const file = new File([new Uint8Array([1, 2, 3])], 'thumb.png', { type: 'image/png' });
    const result = await uploadAdminNewsImage(file);
    expect(result).toEqual({ imageUrl: uploadedPath });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/news/images');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer ok',
      'x-guest-id': 'guest-123',
    });
    expect(init?.headers).not.toHaveProperty('Content-Type');
    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
  });

  it('POSTs preview URL', async () => {
    storeAdminToken('ok');
    fetchMock.mockResolvedValue(
      json({
        title: 'T',
        description: null,
        imageUrl: null,
        publisher: null,
        publishedAt: null,
        canonicalUrl: 'https://a.com',
      }),
    );
    await previewAdminNewsUrl('https://a.com');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ url: 'https://a.com' });
  });
});

describe('resolveNewsImageUrl', () => {
  it('prefixes VITE_API_URL for server-relative paths', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');
    expect(resolveNewsImageUrl('/api/news/images/x.png')).toBe(
      'https://api.example.com/api/news/images/x.png',
    );
    vi.unstubAllEnvs();
  });

  it('returns https URLs unchanged', () => {
    expect(resolveNewsImageUrl('https://cdn.example/thumb.jpg')).toBe(
      'https://cdn.example/thumb.jpg',
    );
  });

  it('returns undefined for empty values', () => {
    expect(resolveNewsImageUrl(undefined)).toBeUndefined();
    expect(resolveNewsImageUrl('  ')).toBeUndefined();
  });
});
