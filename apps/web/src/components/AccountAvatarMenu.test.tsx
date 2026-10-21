import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthProvider';
import { SIGN_OUT_NOTICE, AccountAvatarMenu } from './AccountAvatarMenu';

const fetchMock = vi.fn<typeof fetch>();

const sampleUser = {
  id: '1',
  email: 'player@example.com',
  emailVerified: false,
  displayName: 'Player One',
  accessUntil: null,
  preferredModelId: null,
};

const signedInMe = {
  user: sampleUser,
  access: { active: false, accessUntil: null },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function Shell() {
  return (
    <>
      <AccountAvatarMenu />
      <div data-testid="outlet" />
    </>
  );
}

function renderMenu() {
  return render(
    <MemoryRouter initialEntries={['/learn']}>
      <AuthProvider>
        <Routes>
          <Route path="/learn" element={<Shell />} />
          <Route path="/play-ai" element={<div>Play AI</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(json(signedInMe));
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('AccountAvatarMenu', () => {
  it('opens menu and closes on Escape', async () => {
    renderMenu();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Account menu/i })).toBeInTheDocument(),
    );
    const trigger = screen.getByRole('button', { name: /Account menu/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await userEvent.click(trigger);
    expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText('Player One')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('sign out calls logout and shows notice on play-ai', async () => {
    renderMenu();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Account menu/i })).toBeInTheDocument(),
    );
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/auth/logout')) return Promise.resolve(json({ ok: true }));
      if (url.includes('/api/me')) return Promise.resolve(json(signedInMe));
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    await userEvent.click(screen.getByRole('button', { name: /Account menu/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByText('Play AI')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(screen.queryByRole('button', { name: /Account menu/i })).not.toBeInTheDocument();
  });

  it('keeps session UI when logout fails', async () => {
    renderMenu();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Account menu/i })).toBeInTheDocument(),
    );
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/auth/logout')) {
        return Promise.resolve(json({ error: 'request_failed' }, 500));
      }
      if (url.includes('/api/me')) return Promise.resolve(json(signedInMe));
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    await userEvent.click(screen.getByRole('button', { name: /Account menu/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not sign out/i);
    expect(screen.getByRole('button', { name: /Account menu/i })).toBeInTheDocument();
    expect(screen.queryByText('Play AI')).not.toBeInTheDocument();
  });
});

describe('SIGN_OUT_NOTICE', () => {
  it('matches product copy', () => {
    expect(SIGN_OUT_NOTICE).toBe(
      "You're signed out. Your unfinished games are saved to your account.",
    );
  });
});
