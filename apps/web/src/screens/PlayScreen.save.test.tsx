import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthProvider';
import { PlayScreen } from './PlayScreen';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const user = {
  id: '1',
  email: 'p@example.com',
  emailVerified: true,
  displayName: 'P',
  accessUntil: null,
  preferredModelId: null,
};

const pvcSave = {
  mode: 'pvc',
  config: { level: 'beginner', side: 'r' },
  moves: [{ from: [7, 1], to: [7, 4] }],
  revision: 1,
  createdAt: '2026-10-25T10:00:00.000Z',
  updatedAt: '2026-10-25T10:05:00.000Z',
};

function renderPlay() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <PlayScreen />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((input: RequestInfo | URL, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/me')) {
      return Promise.resolve(json({ user, access: { active: false, accessUntil: null } }));
    }
    if (url.includes('/api/games/active/pvc') && init?.method === 'DELETE') {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url.includes('/api/games/active/pvc')) {
      return Promise.resolve(json(pvcSave));
    }
    if (url.includes('/api/opponent/move')) {
      return Promise.resolve(json({ move: { from: [0, 1], to: [2, 2] }, source: 'negamax' }));
    }
    return Promise.resolve(json({ error: 'unexpected' }, 500));
  });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('PlayScreen save/resume', () => {
  it('shows continue card when a save exists', async () => {
    renderPlay();
    expect(await screen.findByTestId('continue-saved-game')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('confirms before starting a new game when a save exists', async () => {
    renderPlay();
    await screen.findByTestId('continue-saved-game');
    await userEvent.click(screen.getByRole('button', { name: 'Start game →' }));
    expect(screen.getByTestId('new-game-confirm')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Abandon & start new/i }));
    await waitFor(() => expect(screen.getByText('Your move')).toBeInTheDocument());
  });

  it('abandons save from continue card', async () => {
    renderPlay();
    await screen.findByTestId('continue-saved-game');
    await userEvent.click(screen.getByRole('button', { name: 'Abandon' }));
    await waitFor(() =>
      expect(screen.queryByTestId('continue-saved-game')).not.toBeInTheDocument(),
    );
  });
});
