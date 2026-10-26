import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthProvider';
import { AccountScreen } from './AccountScreen';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const unverifiedUser = {
  id: '1',
  email: 'a@example.com',
  emailVerified: false,
  displayName: 'Alice',
  accessUntil: null,
  preferredModelId: null,
};

const signedInMe = json({ user: unverifiedUser, access: { active: false, accessUntil: null } });

function renderAccount() {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <AuthProvider>
        <Routes>
          <Route path="/account" element={<AccountScreen />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/me')) return Promise.resolve(signedInMe);
    if (url.includes('/api/billing/payments')) {
      return Promise.resolve(json({ payments: [] }));
    }
    if (url.includes('/api/games/active')) {
      return Promise.resolve(json({ games: [] }));
    }
    if (url.includes('/api/auth/providers')) {
      return Promise.resolve(json({ providers: [] }));
    }
    if (url.includes('/api/auth/identities')) {
      return Promise.resolve(json({ hasPassword: true, providers: [] }));
    }
    return Promise.resolve(json({ error: 'unexpected' }, 500));
  });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('AccountScreen', () => {
  it('shows resend verification when email is not verified', async () => {
    renderAccount();
    expect(await screen.findByRole('region', { name: 'Email verification' })).toBeInTheDocument();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) return Promise.resolve(signedInMe);
      if (url.includes('/api/auth/resend-verification')) {
        return Promise.resolve(json({ ok: true }));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    await userEvent.click(screen.getByRole('button', { name: /Resend verification email/i }));
    expect(await screen.findByText(/Check your inbox/i)).toBeInTheDocument();
  });
});
