import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthProvider';
import { RegisterScreen } from './RegisterScreen';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const guestMe = json({ user: null, access: { active: false, accessUntil: null } });

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterScreen />} />
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
    return Promise.resolve(json({ error: 'unexpected' }, 500));
  });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('RegisterScreen', () => {
  it('shows email_taken error', async () => {
    renderRegister();
    await screen.findByRole('heading', { name: 'Create account' });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) return Promise.resolve(guestMe);
      if (url.includes('/api/auth/register')) {
        return Promise.resolve(json({ error: 'email_taken' }, 409));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    await userEvent.type(screen.getByLabelText(/^Email/), 'taken@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'password12');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already registered/i);
  });

  it('creates account and navigates to play', async () => {
    renderRegister();
    await screen.findByRole('heading', { name: 'Create account' });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) return Promise.resolve(guestMe);
      if (url.includes('/api/auth/register')) {
        return Promise.resolve(
          json(
            {
              user: {
                id: '1',
                email: 'new@example.com',
                emailVerified: false,
                displayName: 'New',
                accessUntil: null,
                preferredModelId: null,
              },
            },
            201,
          ),
        );
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    await userEvent.type(screen.getByLabelText(/^Email/), 'new@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'password12');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Play page')).toBeInTheDocument();
  });
});
