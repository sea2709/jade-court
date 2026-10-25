import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../context/AuthProvider';
import { SignInMethodsSection } from './SignInMethodsSection';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const signedInUser = {
  id: '1',
  email: 'a@example.com',
  emailVerified: true,
  displayName: 'Alice',
  accessUntil: null,
  preferredModelId: null,
};

function renderSection() {
  return render(
    <AuthProvider>
      <SignInMethodsSection />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/me')) {
      return Promise.resolve(
        json({ user: signedInUser, access: { active: false, accessUntil: null } }),
      );
    }
    if (url.includes('/api/auth/providers')) {
      return Promise.resolve(json({ providers: ['google'] }));
    }
    if (url.includes('/api/auth/identities') && !url.includes('/link')) {
      return Promise.resolve(json({ hasPassword: true, providers: ['google'] }));
    }
    return Promise.resolve(json({ error: 'unexpected' }, 500));
  });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('SignInMethodsSection', () => {
  it('shows password and linked Google', async () => {
    renderSection();
    expect(await screen.findByText('Sign-in methods')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Linked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlink' })).toBeInTheDocument();
  });

  it('shows link button when Google is not linked', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) {
        return Promise.resolve(
          json({ user: signedInUser, access: { active: false, accessUntil: null } }),
        );
      }
      if (url.includes('/api/auth/providers')) {
        return Promise.resolve(json({ providers: ['google'] }));
      }
      if (url.includes('/api/auth/identities')) {
        return Promise.resolve(json({ hasPassword: true, providers: [] }));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    renderSection();
    expect(await screen.findByRole('button', { name: 'Link Google' })).toBeInTheDocument();
  });

  it('surfaces last_sign_in_method on unlink failure', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method =
        (typeof input === 'object' && input instanceof Request ? input.method : init?.method) ??
        'GET';
      if (url.includes('/api/me')) {
        return Promise.resolve(
          json({ user: signedInUser, access: { active: false, accessUntil: null } }),
        );
      }
      if (url.includes('/api/auth/providers')) {
        return Promise.resolve(json({ providers: ['google'] }));
      }
      if (url.includes('/api/auth/identities') && method === 'DELETE') {
        return Promise.resolve(json({ error: 'last_sign_in_method' }, 400));
      }
      if (url.includes('/api/auth/identities')) {
        return Promise.resolve(json({ hasPassword: false, providers: ['google'] }));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    renderSection();
    await screen.findByRole('button', { name: 'Unlink' });
    await userEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/password or another sign-in/i);
    confirmSpy.mockRestore();
  });
});
