import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('ForgotPasswordScreen', () => {
  it('shows same success copy after submit', async () => {
    fetchMock.mockResolvedValue(json({ ok: true, message: 'check_your_email' }));
    render(
      <MemoryRouter>
        <ForgotPasswordScreen />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText(/^Email/), 'someone@example.com');
    await userEvent.click(screen.getByRole('button', { name: /Send reset link/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Check your inbox/i);
  });
});
