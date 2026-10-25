import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthProvider';
import { PlayAiScreen } from './PlayAiScreen';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const guestMe = { user: null, access: { active: false, accessUntil: null } };

const signedInNoPass = {
  user: {
    id: 'u1',
    email: 'a@test.com',
    emailVerified: true,
    displayName: 'Player',
    accessUntil: null,
    preferredModelId: null,
  },
  access: { active: false, accessUntil: null },
};

const signedInActive = {
  user: {
    id: 'u1',
    email: 'a@test.com',
    emailVerified: true,
    displayName: 'Player',
    accessUntil: new Date(Date.now() + 3600_000).toISOString(),
    preferredModelId: 'm1',
  },
  access: {
    active: true,
    accessUntil: new Date(Date.now() + 3600_000).toISOString(),
  },
};

function renderPlayAi(path = '/play-ai') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/play-ai" element={<PlayAiScreen />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/api/me')) return Promise.resolve(json(guestMe));
    if (url.includes('/api/ai/models')) {
      return Promise.resolve(json({ models: [{ id: 'm1', label: 'Model One' }], defaultId: 'm1' }));
    }
    if (url.includes('/api/coach/opening')) {
      return Promise.resolve(json({ text: 'Hello', source: 'llm' }));
    }
    if (url.includes('/api/games/active/ai')) {
      return Promise.resolve(json({ error: 'not_found' }, 404));
    }
    return Promise.resolve(json({}));
  });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('PlayAiScreen gating', () => {
  it('shows signed-out pitch', async () => {
    renderPlayAi();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Play with Master Lin/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByTestId('play-ai-game')).not.toBeInTheDocument();
  });

  it('shows paywall when signed in without pass', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/me')) return Promise.resolve(json(signedInNoPass));
      return Promise.resolve(json({}));
    });
    renderPlayAi();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Unlock Play with AI/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Buy day pass/i })).toBeInTheDocument();
  });

  it('renders the game when access is active', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/me')) return Promise.resolve(json(signedInActive));
      if (url.includes('/api/ai/models')) {
        return Promise.resolve(
          json({ models: [{ id: 'm1', label: 'Model One' }], defaultId: 'm1' }),
        );
      }
      if (url.includes('/api/coach/opening')) {
        return Promise.resolve(json({ text: 'Welcome', source: 'llm' }));
      }
      return Promise.resolve(json({}));
    });
    renderPlayAi();
    await waitFor(() => {
      expect(screen.getByTestId('play-ai-game')).toBeInTheDocument();
    });
    expect(screen.getByText('AI player and coach')).toBeInTheDocument();
    expect(screen.getByText(/Master Lin, AI player/)).toBeInTheDocument();
  });

  it('shows paywall when accessUntil has passed locally even if /api/me still says active', async () => {
    const expiredUntil = new Date(Date.now() - 60_000).toISOString();
    const staleActive = {
      user: {
        ...signedInActive.user,
        accessUntil: expiredUntil,
      },
      access: {
        active: true,
        accessUntil: expiredUntil,
      },
    };
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/me')) return Promise.resolve(json(staleActive));
      return Promise.resolve(json({}));
    });
    renderPlayAi();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Unlock Play with AI/i })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('play-ai-game')).not.toBeInTheDocument();
  });

  it('shows paywall checkout 503 message', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/me')) return Promise.resolve(json(signedInNoPass));
      if (url.includes('/api/billing/checkout')) {
        return Promise.resolve(json({ error: 'billing_disabled' }, 503));
      }
      return Promise.resolve(json({}));
    });
    renderPlayAi();
    await waitFor(() => screen.getByRole('button', { name: /Buy day pass/i }));
    await userEvent.click(screen.getByRole('button', { name: /Buy day pass/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/not available right now/i);
    });
  });

  it('polls /api/me after checkout=success until access is active', async () => {
    let meCalls = 0;
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/me')) {
        meCalls += 1;
        if (meCalls >= 2) {
          return Promise.resolve(json(signedInActive));
        }
        return Promise.resolve(json(signedInNoPass));
      }
      if (url.includes('/api/ai/models')) {
        return Promise.resolve(
          json({ models: [{ id: 'm1', label: 'Model One' }], defaultId: 'm1' }),
        );
      }
      if (url.includes('/api/coach/opening')) {
        return Promise.resolve(json({ text: 'Hi', source: 'llm' }));
      }
      return Promise.resolve(json({}));
    });
    renderPlayAi('/play-ai?checkout=success');
    expect(screen.getByText(/Confirming payment/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('play-ai-game')).toBeInTheDocument();
    });
    expect(meCalls).toBeGreaterThanOrEqual(2);
  });

  it('does not show confirming state without checkout success param', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/me')) return Promise.resolve(json(signedInNoPass));
      if (url.includes('/api/ai/models')) {
        return Promise.resolve(json({ models: [], defaultId: 'm1' }));
      }
      return Promise.resolve(json({}));
    });
    renderPlayAi('/play-ai');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Unlock Play with AI/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Confirming payment/i)).not.toBeInTheDocument();
  });
});
