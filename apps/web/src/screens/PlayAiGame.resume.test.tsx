import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthProvider';
import { PlayAiGame } from './PlayAiGame';

const { streamCoachPostMock } = vi.hoisted(() => ({
  streamCoachPostMock: vi.fn(),
}));

vi.mock('../lib/coachStream', () => ({
  streamCoachPost: (...args: unknown[]) => streamCoachPostMock(...args),
}));

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  streamCoachPostMock.mockResolvedValue(undefined);
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/api/me')) {
      return Promise.resolve(
        json({
          user: {
            id: '1',
            email: 'a@b.com',
            emailVerified: true,
            displayName: 'A',
            accessUntil: new Date(Date.now() + 3600_000).toISOString(),
            preferredModelId: null,
          },
          access: { active: true, accessUntil: new Date(Date.now() + 3600_000).toISOString() },
        }),
      );
    }
    if (url.includes('/api/ai/models')) {
      return Promise.resolve(json({ models: [{ id: 'm1', label: 'Model One' }], defaultId: 'm1' }));
    }
    if (url.includes('/api/games/active/ai')) {
      return Promise.resolve(json({ error: 'not_found' }, 404));
    }
    if (url.includes('/api/ai/move')) {
      return Promise.resolve(json({ error: 'access_required' }, 402));
    }
    return Promise.resolve(json({}));
  });
});

afterEach(() => {
  fetchMock.mockReset();
  streamCoachPostMock.mockReset();
  vi.unstubAllGlobals();
});

describe('PlayAiGame resume', () => {
  it('restores chat and shows resumed system line', async () => {
    const resumeSave = {
      mode: 'ai' as const,
      config: { modelId: 'm1', difficulty: 'beginner' as const, side: 'r' as const },
      moves: [{ from: [7, 1] as [number, number], to: [7, 4] as [number, number] }],
      revision: 2,
      createdAt: '2026-10-25T09:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.000Z',
      chat: [{ id: 1, from: 'coach' as const, text: 'Saved coach line' }],
    };

    render(
      <AuthProvider>
        <PlayAiGame
          accessUntil={new Date(Date.now() + 3600_000).toISOString()}
          preferredModelId={null}
          resumeSave={resumeSave}
        />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('Saved coach line')).toBeInTheDocument());
    expect(screen.getByText(/Resumed your game from/i)).toBeInTheDocument();
  });
});
