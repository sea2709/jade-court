import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthProvider';
import { VerifyEmailScreen } from './VerifyEmailScreen';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const guestMe = json({ user: null, access: { active: false, accessUntil: null } });

const verifiedUserA = {
  id: '1',
  email: 'a@example.com',
  emailVerified: true,
  displayName: null,
  accessUntil: null,
  preferredModelId: null,
};

const unverifiedUserB = {
  id: '2',
  email: 'b@example.com',
  emailVerified: false,
  displayName: null,
  accessUntil: null,
  preferredModelId: null,
};

function renderVerify(initial = '/verify-email?token=abc') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <AuthProvider>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailScreen />} />
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

describe('VerifyEmailScreen', () => {
  it('shows success after verify and refresh from /api/me', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) {
        return Promise.resolve(
          json({ user: verifiedUserA, access: { active: false, accessUntil: null } }),
        );
      }
      if (url.includes('/api/auth/verify')) {
        return Promise.resolve(json({ user: verifiedUserA }));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    renderVerify();
    expect(await screen.findByText(/Your email is verified/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Play vs Computer/i })).toBeInTheDocument();
    const meCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/me'));
    expect(meCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('shows error for invalid token', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) return Promise.resolve(guestMe);
      if (url.includes('/api/auth/verify')) {
        return Promise.resolve(json({ error: 'invalid_token' }, 401));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    renderVerify();
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or expired/i);
  });

  it('shows wrong-account copy and sign out when API returns wrong_account', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) {
        return Promise.resolve(
          json({ user: unverifiedUserB, access: { active: false, accessUntil: null } }),
        );
      }
      if (url.includes('/api/auth/verify')) {
        return Promise.resolve(json({ error: 'wrong_account' }, 403));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    renderVerify();
    expect(await screen.findByRole('alert')).toHaveTextContent(/different account/i);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('does not show success when verify user id differs from session after refresh', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) {
        return Promise.resolve(
          json({ user: unverifiedUserB, access: { active: false, accessUntil: null } }),
        );
      }
      if (url.includes('/api/auth/verify')) {
        return Promise.resolve(json({ user: verifiedUserA }));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    renderVerify();
    expect(await screen.findByRole('alert')).toHaveTextContent(/different account/i);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByText(/Your email is verified/i)).not.toBeInTheDocument();
  });

  it('shows missing token message without query', async () => {
    renderVerify('/verify-email');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/missing a token/i);
    });
  });

  it('sign out from wrong-account state clears session and prompts to reopen link', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) {
        return Promise.resolve(
          json({ user: unverifiedUserB, access: { active: false, accessUntil: null } }),
        );
      }
      if (url.includes('/api/auth/verify')) {
        return Promise.resolve(json({ error: 'wrong_account' }, 403));
      }
      if (url.includes('/api/auth/logout')) {
        return Promise.resolve(json({ ok: true }));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    renderVerify();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Open this verification link again/i,
    );
  });
});
