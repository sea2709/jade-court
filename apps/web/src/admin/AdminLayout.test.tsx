import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_SESSION_STORAGE_KEY } from '../lib/adminApi';
import { AdminLayout } from './AdminLayout';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const futureExpiry = () => new Date(Date.now() + 60_000).toISOString();

function renderAdminLayout(initialEntry = '/admin') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/login" element={<div>Login page</div>} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<div>Dashboard body</div>} />
          <Route path="news" element={<div>News section</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function storeSession(overrides?: Partial<{ token: string; username: string; expiresAt: string }>) {
  sessionStorage.setItem(
    ADMIN_SESSION_STORAGE_KEY,
    JSON.stringify({
      token: 'tok',
      username: 'e2e-admin',
      expiresAt: futureExpiry(),
      ...overrides,
    }),
  );
}

beforeEach(() => {
  sessionStorage.clear();
  document.querySelectorAll('meta[name="robots"]').forEach((el) => el.remove());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('AdminLayout', () => {
  it('redirects to login with next when logged out', async () => {
    renderAdminLayout('/admin/news');
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  it('redirects without calling /me when session is expired', async () => {
    storeSession({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    renderAdminLayout('/admin/news');
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redirects to login on /me 401', async () => {
    storeSession();
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    renderAdminLayout();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('shows retry on network error from /me', async () => {
    storeSession();
    fetchMock.mockRejectedValue(new Error('offline'));
    renderAdminLayout();
    expect(await screen.findByRole('alert')).toHaveTextContent(/verify your session/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY)).not.toBeNull();
  });

  it('renders nav and outlet after /me succeeds', async () => {
    storeSession();
    fetchMock.mockResolvedValue(json({ username: 'e2e-admin' }));
    renderAdminLayout('/admin/news');
    expect(await screen.findByText('News section')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Admin sections' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'News' })).toBeInTheDocument();
  });

  it('sign out clears session and goes to login', async () => {
    storeSession();
    fetchMock.mockResolvedValue(json({ username: 'e2e-admin' }));
    renderAdminLayout();
    await screen.findByText('Dashboard body');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('sets noindex meta while mounted', async () => {
    storeSession();
    fetchMock.mockResolvedValue(json({ username: 'e2e-admin' }));
    renderAdminLayout();
    await screen.findByText('Dashboard body');
    await waitFor(() => {
      expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    });
  });
});
