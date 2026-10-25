import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteActiveGame, fetchActiveGame, fetchActiveGames, putActiveGame } from './gamesApi';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('gamesApi', () => {
  it('fetchActiveGames uses credentials include', async () => {
    fetchMock.mockResolvedValue(json({ games: [] }));
    await fetchActiveGames();
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: 'include' });
  });

  it('fetchActiveGame returns null on 404 not_found', async () => {
    fetchMock.mockResolvedValue(json({ error: 'not_found' }, 404));
    await expect(fetchActiveGame('pvc')).resolves.toBeNull();
  });

  it('putActiveGame throws GamesApiError on stale_revision', async () => {
    fetchMock.mockResolvedValue(json({ error: 'stale_revision' }, 409));
    await expect(
      putActiveGame('pvc', {
        config: { level: 'beginner', side: 'r' },
        moves: [],
        baseRevision: 1,
      }),
    ).rejects.toMatchObject({ code: 'stale_revision', status: 409 });
  });

  it('putActiveGame returns finished payload', async () => {
    fetchMock.mockResolvedValue(json({ finished: true, status: 'checkmate' }));
    await expect(
      putActiveGame('pvc', {
        config: { level: 'beginner', side: 'r' },
        moves: [{ from: [7, 1], to: [7, 4] }],
      }),
    ).resolves.toEqual({ finished: true, status: 'checkmate' });
  });

  it('deleteActiveGame accepts 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteActiveGame('ai')).resolves.toBeUndefined();
  });
});
