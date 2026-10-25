import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthProvider';
import { STALE_REVISION_MESSAGE, useSavedGame } from './useSavedGame';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const signedInUser = {
  id: 'u1',
  email: 'a@b.com',
  emailVerified: true,
  displayName: 'A',
  accessUntil: null,
  preferredModelId: null,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/me')) {
      return Promise.resolve(
        json({ user: signedInUser, access: { active: false, accessUntil: null } }),
      );
    }
    if (url.includes('/api/games/active/pvc')) {
      return Promise.resolve(
        json({
          mode: 'pvc',
          config: { level: 'beginner', side: 'r' },
          moves: [],
          revision: 1,
          createdAt: '2026-10-25T10:00:00.000Z',
          updatedAt: '2026-10-25T10:00:00.000Z',
        }),
      );
    }
    return Promise.resolve(json({ error: 'unexpected' }, 500));
  });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('useSavedGame', () => {
  it('loads save when signed in', async () => {
    const { result } = renderHook(() => useSavedGame('pvc'), { wrapper });
    await waitFor(() => expect(result.current.signedIn).toBe(true));
    await waitFor(() => expect(result.current.save?.revision).toBe(1));
  });

  it('debounces autosave PUT (~500ms)', async () => {
    const { result } = renderHook(() => useSavedGame('pvc'), { wrapper });
    await waitFor(() => expect(result.current.signedIn).toBe(true));

    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/api/me')) {
        return Promise.resolve(
          json({ user: signedInUser, access: { active: false, accessUntil: null } }),
        );
      }
      if (url.includes('/api/games/active/pvc') && init?.method === 'PUT') {
        return Promise.resolve(
          json({
            mode: 'pvc',
            config: { level: 'beginner', side: 'r' },
            moves: [{ from: [7, 1], to: [7, 4] }],
            revision: 2,
            createdAt: '2026-10-25T10:00:00.000Z',
            updatedAt: '2026-10-25T10:05:00.000Z',
          }),
        );
      }
      if (url.includes('/api/games/active/pvc')) {
        return Promise.resolve(
          json({
            mode: 'pvc',
            config: { level: 'beginner', side: 'r' },
            moves: [],
            revision: 1,
            createdAt: '2026-10-25T10:00:00.000Z',
            updatedAt: '2026-10-25T10:00:00.000Z',
          }),
        );
      }
      return Promise.resolve(json({}));
    });

    const putsBeforeSchedule = fetchMock.mock.calls.filter(
      ([u, i]) => String(u).includes('/api/games/active/pvc') && i?.method === 'PUT',
    ).length;

    act(() => {
      result.current.scheduleAutosave({
        config: { level: 'beginner', side: 'r' },
        moves: [{ from: [7, 1], to: [7, 4] }],
      });
    });

    const putsRightAfter = fetchMock.mock.calls.filter(
      ([u, i]) => String(u).includes('/api/games/active/pvc') && i?.method === 'PUT',
    ).length;
    expect(putsRightAfter).toBe(putsBeforeSchedule);

    await act(async () => {
      await result.current.flushAutosave();
    });

    const putsAfterFlush = fetchMock.mock.calls.filter(
      ([u, i]) => String(u).includes('/api/games/active/pvc') && i?.method === 'PUT',
    ).length;
    expect(putsAfterFlush).toBeGreaterThan(putsBeforeSchedule);
  });

  it('surfaces stale revision message', async () => {
    const { result } = renderHook(() => useSavedGame('pvc'), { wrapper });
    await waitFor(() => expect(result.current.signedIn).toBe(true));

    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/api/me')) {
        return Promise.resolve(
          json({ user: signedInUser, access: { active: false, accessUntil: null } }),
        );
      }
      if (url.includes('/api/games/active/pvc') && init?.method === 'PUT') {
        return Promise.resolve(json({ error: 'stale_revision' }, 409));
      }
      if (url.includes('/api/games/active/pvc')) {
        return Promise.resolve(
          json({
            mode: 'pvc',
            config: { level: 'beginner', side: 'r' },
            moves: [],
            revision: 1,
            createdAt: '2026-10-25T10:00:00.000Z',
            updatedAt: '2026-10-25T10:00:00.000Z',
          }),
        );
      }
      return Promise.resolve(json({}));
    });

    await act(async () => {
      result.current.scheduleAutosave({
        config: { level: 'beginner', side: 'r' },
        moves: [{ from: [7, 1], to: [7, 4] }],
      });
      await result.current.flushAutosave();
    });

    await waitFor(() => expect(result.current.staleRevisionError).toBe(STALE_REVISION_MESSAGE));
  });

  it('surfaces autosave failures other than stale revision', async () => {
    const { result } = renderHook(() => useSavedGame('pvc'), { wrapper });
    await waitFor(() => expect(result.current.signedIn).toBe(true));

    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/api/me')) {
        return Promise.resolve(
          json({ user: signedInUser, access: { active: false, accessUntil: null } }),
        );
      }
      if (url.includes('/api/games/active/pvc') && init?.method === 'PUT') {
        return Promise.resolve(json({ error: 'invalid_moves' }, 400));
      }
      if (url.includes('/api/games/active/pvc')) {
        return Promise.resolve(
          json({
            mode: 'pvc',
            config: { level: 'beginner', side: 'r' },
            moves: [],
            revision: 1,
            createdAt: '2026-10-25T10:00:00.000Z',
            updatedAt: '2026-10-25T10:00:00.000Z',
          }),
        );
      }
      return Promise.resolve(json({}));
    });

    await act(async () => {
      result.current.scheduleAutosave({
        config: { level: 'beginner', side: 'r' },
        moves: [{ from: [7, 1], to: [7, 4] }],
      });
      await result.current.flushAutosave();
    });

    await waitFor(() => expect(result.current.saveError).toMatch(/Couldn't save/i));
    expect(result.current.staleRevisionError).toBeNull();

    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/api/me')) {
        return Promise.resolve(
          json({ user: signedInUser, access: { active: false, accessUntil: null } }),
        );
      }
      if (url.includes('/api/games/active/pvc') && init?.method === 'PUT') {
        return Promise.resolve(
          json({
            mode: 'pvc',
            config: { level: 'beginner', side: 'r' },
            moves: [{ from: [7, 1], to: [7, 4] }],
            revision: 2,
            createdAt: '2026-10-25T10:00:00.000Z',
            updatedAt: '2026-10-25T10:05:00.000Z',
          }),
        );
      }
      if (url.includes('/api/games/active/pvc')) {
        return Promise.resolve(
          json({
            mode: 'pvc',
            config: { level: 'beginner', side: 'r' },
            moves: [],
            revision: 1,
            createdAt: '2026-10-25T10:00:00.000Z',
            updatedAt: '2026-10-25T10:00:00.000Z',
          }),
        );
      }
      return Promise.resolve(json({}));
    });

    await act(async () => {
      result.current.scheduleAutosave({
        config: { level: 'beginner', side: 'r' },
        moves: [{ from: [7, 1], to: [7, 4] }],
      });
      await result.current.flushAutosave();
    });

    await waitFor(() => expect(result.current.saveError).toBeNull());
  });

  it('reloadFromServer ignores a stale in-flight PUT completion', async () => {
    const { result } = renderHook(() => useSavedGame('pvc'), { wrapper });
    await waitFor(() => expect(result.current.signedIn).toBe(true));

    let releaseStalePut: (() => void) | undefined;

    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/api/me')) {
        return Promise.resolve(
          json({ user: signedInUser, access: { active: false, accessUntil: null } }),
        );
      }
      if (url.includes('/api/games/active/pvc') && init?.method === 'PUT') {
        return new Promise<Response>((resolve) => {
          releaseStalePut = () => {
            resolve(
              json({
                mode: 'pvc',
                config: { level: 'beginner', side: 'r' },
                moves: [{ from: [7, 1], to: [7, 4] }],
                revision: 2,
                createdAt: '2026-10-25T10:00:00.000Z',
                updatedAt: '2026-10-25T10:05:00.000Z',
              }),
            );
          };
        });
      }
      if (url.includes('/api/games/active/pvc')) {
        return Promise.resolve(
          json({
            mode: 'pvc',
            config: { level: 'beginner', side: 'r' },
            moves: [
              { from: [7, 1], to: [7, 4] },
              { from: [9, 1], to: [7, 2] },
            ],
            revision: 5,
            createdAt: '2026-10-25T10:00:00.000Z',
            updatedAt: '2026-10-25T10:10:00.000Z',
          }),
        );
      }
      return Promise.resolve(json({}));
    });

    await act(async () => {
      result.current.scheduleAutosave({
        config: { level: 'beginner', side: 'r' },
        moves: [{ from: [7, 1], to: [7, 4] }],
      });
      void result.current.flushAutosave();
    });

    await act(async () => {
      const loaded = await result.current.reloadFromServer();
      expect(loaded?.moves).toHaveLength(2);
      expect(loaded?.revision).toBe(5);
    });

    await act(async () => {
      releaseStalePut?.();
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => expect(result.current.save?.moves).toHaveLength(2));
    expect(result.current.save?.revision).toBe(5);
  });
});
