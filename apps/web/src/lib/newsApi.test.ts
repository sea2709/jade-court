import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredAdminToken,
  createAdminNewsItem,
  deleteAdminNewsItem,
  fetchAdminNews,
  fetchPublicNews,
  patchAdminNewsItem,
  NEWS_ADMIN_TOKEN_STORAGE_KEY,
  NewsApiError,
  previewAdminNewsUrl,
  setStoredAdminToken,
} from './newsApi';

const fetchMock = vi.fn<typeof fetch>();

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

  it('does not clear the admin token on 401', async () => {
    setStoredAdminToken('keep-me');
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    await expect(fetchPublicNews()).rejects.toBeInstanceOf(NewsApiError);
    expect(sessionStorage.getItem(NEWS_ADMIN_TOKEN_STORAGE_KEY)).toBe('keep-me');
  });
});

describe('admin news API', () => {
  it('sends Authorization bearer on admin requests', async () => {
    setStoredAdminToken('secret-token');
    fetchMock.mockResolvedValue(json({ items: [], nextCursor: null }));
    await fetchAdminNews();
    expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({
      Authorization: 'Bearer secret-token',
    });
  });

  it('clears stored token on 401', async () => {
    setStoredAdminToken('bad');
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    await expect(fetchAdminNews()).rejects.toBeInstanceOf(NewsApiError);
    expect(sessionStorage.getItem(NEWS_ADMIN_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('throws NewsApiError with validation fields', async () => {
    setStoredAdminToken('ok');
    fetchMock.mockResolvedValue(json({ error: 'validation', fields: { title: 'Too short' } }, 400));
    await expect(createAdminNewsItem({ sourceUrl: 'https://a.com/x' })).rejects.toMatchObject({
      code: 'validation',
      fields: { title: 'Too short' },
    });
  });

  it('PATCHes an admin item', async () => {
    setStoredAdminToken('ok');
    fetchMock.mockResolvedValue(json({ id: 'id-1', status: 'published' }));
    await patchAdminNewsItem('id-1', { status: 'published' });
    expect(fetchMock.mock.calls[0]![1]?.method).toBe('PATCH');
  });

  it('DELETEs an admin item', async () => {
    setStoredAdminToken('ok');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await deleteAdminNewsItem('id-1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/news/id-1');
    expect(init?.method).toBe('DELETE');
  });

  it('POSTs preview URL', async () => {
    setStoredAdminToken('ok');
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

describe('token helpers', () => {
  it('clearStoredAdminToken removes the key', () => {
    setStoredAdminToken('x');
    clearStoredAdminToken();
    expect(sessionStorage.getItem(NEWS_ADMIN_TOKEN_STORAGE_KEY)).toBeNull();
  });
});
