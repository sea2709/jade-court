import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_SESSION_STORAGE_KEY } from '../lib/adminApi';
import { AdminLoginScreen } from './AdminLoginScreen';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const futureExpiry = () => new Date(Date.now() + 60_000).toISOString();

function renderLogin(initialEntry = '/admin/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/login" element={<AdminLoginScreen />} />
        <Route path="/admin" element={<div>Dashboard</div>} />
        <Route path="/admin/news" element={<div>News admin</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('AdminLoginScreen', () => {
  it('redirects to dashboard when session already valid', async () => {
    sessionStorage.setItem(
      ADMIN_SESSION_STORAGE_KEY,
      JSON.stringify({ token: 't', username: 'a', expiresAt: futureExpiry() }),
    );
    renderLogin();
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('navigates to next after successful login', async () => {
    fetchMock.mockResolvedValue(
      json({ token: 'tok', username: 'alice', expiresAt: futureExpiry() }),
    );
    renderLogin('/admin/login?next=%2Fadmin%2Fnews');
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('News admin')).toBeInTheDocument();
  });

  it('defaults to /admin when next uses path traversal', async () => {
    fetchMock.mockResolvedValue(
      json({ token: 'tok', username: 'alice', expiresAt: futureExpiry() }),
    );
    renderLogin('/admin/login?next=%2Fadmin%2F..%2Flogin');
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('defaults to /admin when next is unsafe', async () => {
    fetchMock.mockResolvedValue(
      json({ token: 'tok', username: 'alice', expiresAt: futureExpiry() }),
    );
    renderLogin('/admin/login?next=%2F%2Fevil.com');
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('rejects https and login next targets', async () => {
    fetchMock.mockResolvedValue(
      json({ token: 'tok', username: 'alice', expiresAt: futureExpiry() }),
    );
    for (const next of ['/admin/login', 'https://evil.com', '/\\evil.com']) {
      sessionStorage.clear();
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(
        json({ token: 'tok', username: 'alice', expiresAt: futureExpiry() }),
      );
      const { unmount } = renderLogin(`/admin/login?next=${encodeURIComponent(next)}`);
      await userEvent.type(screen.getByLabelText('Username'), 'alice');
      await userEvent.type(screen.getByLabelText('Password'), 'secret');
      await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(await screen.findByText('Dashboard')).toBeInTheDocument();
      unmount();
    }
  });

  it('shows client validation for empty fields', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your username and password.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows invalid credentials message', async () => {
    fetchMock.mockResolvedValue(json({ error: 'invalid_credentials' }, 401));
    renderLogin();
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password.');
  });

  it('shows rate limit message', async () => {
    fetchMock.mockResolvedValue(json({ error: 'rate_limited' }, 429));
    renderLogin();
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again in a few minutes.',
    );
  });

  it('shows admin disabled message', async () => {
    fetchMock.mockResolvedValue(json({ error: 'admin_disabled' }, 503));
    renderLogin();
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'pass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Admin is disabled');
  });

  it('shows generic error on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    renderLogin();
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'pass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
  });

  it('sets noindex meta on mount', async () => {
    renderLogin();
    await waitFor(() => {
      const meta = document.querySelector('meta[name="robots"]');
      expect(meta).toHaveAttribute('content', 'noindex');
    });
  });
});
