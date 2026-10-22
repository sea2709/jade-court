import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthProvider';
import { ResetPasswordScreen } from './ResetPasswordScreen';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const guestMe = json({ user: null, access: { active: false, accessUntil: null } });

function renderReset() {
  return render(
    <MemoryRouter initialEntries={['/reset-password?token=reset-tok']}>
      <AuthProvider>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordScreen />} />
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

describe('ResetPasswordScreen', () => {
  it('resets password and navigates to play', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/me')) return Promise.resolve(guestMe);
      if (url.includes('/api/auth/reset-password')) {
        return Promise.resolve(
          json({
            user: {
              id: '1',
              email: 'a@example.com',
              emailVerified: true,
              displayName: null,
              accessUntil: null,
              preferredModelId: null,
            },
          }),
        );
      }
      return Promise.resolve(json({ error: 'unexpected' }, 500));
    });
    renderReset();
    await userEvent.type(screen.getByLabelText(/^New password/), 'newpassword1');
    await userEvent.type(screen.getByLabelText(/^Confirm password/), 'newpassword1');
    await userEvent.click(screen.getByRole('button', { name: /Save new password/i }));
    expect(await screen.findByText('Play page')).toBeInTheDocument();
  });
});
