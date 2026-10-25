import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiModels } from './useAiModels';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('useAiModels', () => {
  it('builds modelRunningCaption with blurb when present', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [{ id: 'm1', label: 'Gemini Flash', blurb: 'Fast and cheap' }],
          defaultId: 'm1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useAiModels(null));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.modelLabel).toBe('Gemini Flash');
    expect(result.current.modelRunningCaption).toBe('Gemini Flash · Fast and cheap');
  });

  it('modelRunningCaption is label only when blurb is missing', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [{ id: 'm1', label: 'Model One' }],
          defaultId: 'm1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useAiModels(null));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.modelRunningCaption).toBe('Model One');
  });

  it('prefers user pick over preferredModelId', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          defaultId: 'a',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useAiModels('a'));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.modelId).toBe('a');

    result.current.pickModel('b');
    await waitFor(() => expect(result.current.modelId).toBe('b'));
  });

  it('ignores stale preferredModelId not in the catalog', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [{ id: 'gemini-flash', label: 'Gemini Flash' }],
          defaultId: 'gemini-flash',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useAiModels('gpt-4o-mini'));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.modelId).toBe('gemini-flash');
    expect(result.current.modelLabel).toBe('Gemini Flash');
  });

  it('falls back to first model when API defaultId is not in models', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [{ id: 'only', label: 'Only' }],
          defaultId: 'removed-preset',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result } = renderHook(() => useAiModels(null));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.modelId).toBe('only');
  });

  it('returns null modelId when the catalog is empty', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ models: [], defaultId: 'ghost' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useAiModels('ghost'));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.modelId).toBeNull();
    expect(result.current.modelLabel).toBe('default model');
  });
});
