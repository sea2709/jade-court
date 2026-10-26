import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthProvider';
import { LoginScreen } from './LoginScreen';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const guestMe = json({ user: null, access: { active: false, accessUntil: null } });

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/play" element={<div>Play page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/me')) return Promise.resolve(guestMe);
    if (url.includes('/api/auth/providers')) {
      return Promise.resolve(json({ providers: [] }));
    }
    return Promise.resolve(json({ error: 'unexpected' }, 500));
  });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('LoginScreen', () => {
  it('shows Continue with Google when google provider is configured', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) return Promise.resolve(guestMe);
      if (url.includes('/api/auth/providers')) {
        return Promise.resolve(json({ providers: ['google'] }));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    renderLogin();
    const link = await screen.findByRole('link', { name: 'Continue with Google' });
    expect(link).toHaveAttribute('href', '/api/auth/google/start?returnTo=%2Fplay');
  });

  it('hides Google button when google is not listed', async () => {
    renderLogin();
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByRole('link', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  it('shows error on invalid credentials', async () => {
    renderLogin();
    await screen.findByRole('heading', { name: 'Sign in' });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) return Promise.resolve(guestMe);
      if (url.includes('/api/auth/providers')) {
        return Promise.resolve(json({ providers: [] }));
      }
      if (url.includes('/api/auth/login')) {
        return Promise.resolve(json({ error: 'invalid_credentials' }, 401));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    await userEvent.type(screen.getByLabelText('Email'), 'a@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('navigates to play after successful login', async () => {
    renderLogin();
    await screen.findByRole('heading', { name: 'Sign in' });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) return Promise.resolve(guestMe);
      if (url.includes('/api/auth/providers')) {
        return Promise.resolve(json({ providers: [] }));
      }
      if (url.includes('/api/auth/login')) {
        return Promise.resolve(
          json({
            user: {
              id: '1',
              email: 'a@example.com',
              emailVerified: false,
              displayName: null,
              accessUntil: null,
              preferredModelId: null,
            },
          }),
        );
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    await userEvent.type(screen.getByLabelText('Email'), 'a@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Play page')).toBeInTheDocument();
  });
});
