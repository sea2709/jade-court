import { fireEvent, render, screen } from '@testing-library/react';
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
          <Route path="/register/sent" element={<div>Check inbox page</div>} />
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

function registerCalls() {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/auth/register'));
}

describe('RegisterScreen', () => {
  it('marks display name, email, and password as required', async () => {
    renderRegister();
    await screen.findByRole('heading', { name: 'Create account' });
    expect(screen.getByLabelText(/^Display name/)).toBeRequired();
    expect(screen.getByLabelText(/^Email/)).toBeRequired();
    expect(screen.getByLabelText(/^Password/)).toBeRequired();
    expect(screen.queryByText(/optional/i)).not.toBeInTheDocument();
  });

  it('shows a visible required marker on every field', async () => {
    renderRegister();
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
  ])('blocks submit without a %s', async (_label, values) => {
    renderRegister();
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
    await userEvent.type(screen.getByLabelText(/^Display name/), 'Taken');
    await userEvent.type(screen.getByLabelText(/^Email/), 'taken@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'password12');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already registered/i);
  });

  it('creates account and navigates to check inbox', async () => {
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
