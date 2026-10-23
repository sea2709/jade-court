import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAiModels } from './aiModelsApi';
import { GemmaApiError } from './gemmaApi';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('fetchAiModels', () => {
  it('parses models and defaultId', async () => {
    fetchMock.mockResolvedValue(
      json({
        models: [{ id: 'm1', label: 'One', blurb: 'Fast' }],
        defaultId: 'm1',
      }),
    );
    const res = await fetchAiModels();
    expect(res.defaultId).toBe('m1');
    expect(res.models[0]?.label).toBe('One');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: 'include' });
  });

  it('throws GemmaApiError on failure', async () => {
    fetchMock.mockResolvedValue(json({ error: 'not_found' }, 404));
    await expect(fetchAiModels()).rejects.toBeInstanceOf(GemmaApiError);
  });
});
