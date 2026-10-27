import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthProvider';
import { AuthScreen } from './AuthScreen';
import { RegisterRedirect } from './RegisterRedirect';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const guestMe = json({ user: null, access: { active: false, accessUntil: null } });

function renderAuth(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<AuthScreen />} />
          <Route path="/register" element={<RegisterRedirect />} />
          <Route path="/register/sent" element={<div>Check inbox page</div>} />
          <Route path="/play" element={<div>Play page</div>} />
          <Route path="/account" element={<div>Account page</div>} />
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

function registerCalls() {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/auth/register'));
}

describe('AuthScreen', () => {
  it('defaults to sign-in mode at /login', async () => {
    renderAuth('/login');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Display name/)).not.toBeInTheDocument();
  });

  it('shows create account mode when mode=register', async () => {
    renderAuth('/login?mode=register');
    expect(await screen.findByRole('heading', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Display name/)).toBeInTheDocument();
  });

  it('redirects /register to /login?mode=register preserving next', async () => {
    renderAuth('/register?next=%2Faccount');
    expect(await screen.findByRole('heading', { name: 'Create account' })).toBeInTheDocument();
  });

  it('switch link keeps typed email and next param', async () => {
    const user = userEvent.setup();
    renderAuth('/login?next=%2Fplay');
    await screen.findByRole('heading', { name: 'Sign in' });
    await user.type(screen.getByLabelText('Email'), 'keep@example.com');
    await user.click(screen.getByRole('link', { name: 'Create one' }));
    expect(await screen.findByRole('heading', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveValue('keep@example.com');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Fplay',
    );
  });

  it('shows Continue with Facebook when fake provider stands in for Facebook', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) return Promise.resolve(guestMe);
      if (url.includes('/api/auth/providers')) {
        return Promise.resolve(json({ providers: ['fake'] }));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    renderAuth('/login');
    const link = await screen.findByRole('link', { name: 'Continue with Facebook' });
    expect(link).toHaveAttribute('href', '/api/auth/fake/start?returnTo=%2Fplay');
  });

  it('uses next as OAuth returnTo in register mode', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) return Promise.resolve(guestMe);
      if (url.includes('/api/auth/providers')) {
        return Promise.resolve(json({ providers: ['google'] }));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    renderAuth('/login?mode=register&next=%2Faccount');
    const link = await screen.findByRole('link', { name: 'Continue with Google' });
    expect(link).toHaveAttribute('href', '/api/auth/google/start?returnTo=%2Faccount');
  });

  it('uses next as OAuth returnTo in sign-in mode', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) return Promise.resolve(guestMe);
      if (url.includes('/api/auth/providers')) {
        return Promise.resolve(json({ providers: ['google'] }));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    renderAuth('/login?next=%2Faccount');
    const link = await screen.findByRole('link', { name: 'Continue with Google' });
    expect(link).toHaveAttribute('href', '/api/auth/google/start?returnTo=%2Faccount');
  });

  it('shows error on invalid credentials', async () => {
    renderAuth('/login');
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
    renderAuth('/login');
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

  it('marks display name, email, and password as required in register mode', async () => {
    renderAuth('/login?mode=register');
    await screen.findByRole('heading', { name: 'Create account' });
    expect(screen.getByLabelText(/^Display name/)).toBeRequired();
    expect(screen.getByLabelText(/^Email/)).toBeRequired();
    expect(screen.getByLabelText(/^Password/)).toBeRequired();
    expect(screen.queryByText(/optional/i)).not.toBeInTheDocument();
  });

  it('shows a visible required marker on every register field', async () => {
    renderAuth('/login?mode=register');
    await screen.findByRole('heading', { name: 'Create account' });
    for (const label of [/^Display name/, /^Email/, /^Password/]) {
      const field = screen.getByLabelText(label);
      const marker = field.closest('label')?.querySelector('[data-required-mark]');
      expect(marker).toHaveTextContent('*');
      expect(marker).toHaveAttribute('aria-hidden', 'true');
    }
    expect(screen.getByText(/required field/i)).toBeInTheDocument();
  });

  it.each([
    ['display name', { email: 'a@example.com', password: 'password12', displayName: '   ' }],
    ['email', { email: '', password: 'password12', displayName: 'Dang' }],
    ['password', { email: 'a@example.com', password: '', displayName: 'Dang' }],
  ])('blocks register submit without a %s', async (_label, values) => {
    renderAuth('/login?mode=register');
    await screen.findByRole('heading', { name: 'Create account' });
    fireEvent.change(screen.getByLabelText(/^Display name/), {
      target: { value: values.displayName },
    });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: values.email } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: values.password } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter your display name, email, and password.',
    );
    expect(registerCalls()).toHaveLength(0);
  });

  it('email_taken offers Sign in instead and switches mode keeping email', async () => {
    const user = userEvent.setup();
    renderAuth('/login?mode=register');
    await screen.findByRole('heading', { name: 'Create account' });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) return Promise.resolve(guestMe);
      if (url.includes('/api/auth/register')) {
        return Promise.resolve(json({ error: 'email_taken' }, 409));
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    await user.type(screen.getByLabelText(/^Display name/), 'Taken');
    await user.type(screen.getByLabelText(/^Email/), 'taken@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'password12');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already registered/i);
    await user.click(screen.getByRole('button', { name: 'Sign in instead' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('taken@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('creates account and navigates to check inbox', async () => {
    renderAuth('/login?mode=register');
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
    await userEvent.type(screen.getByLabelText(/^Display name/), '  New  ');
    await userEvent.type(screen.getByLabelText(/^Email/), 'new@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'password12');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check inbox page')).toBeInTheDocument();
    const [, init] = registerCalls()[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'new@example.com',
      password: 'password12',
      displayName: 'New',
    });
  });
});
