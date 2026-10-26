import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddAccountEmailPanel } from './AddAccountEmailPanel';

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

describe('AddAccountEmailPanel', () => {
  it('submits email and shows verification sent state', async () => {
    fetchMock.mockResolvedValue(
      json({
        user: {
          id: '1',
          email: 'new@example.com',
          emailVerified: false,
          displayName: null,
          accessUntil: null,
          preferredModelId: null,
        },
      }),
    );
    render(<AddAccountEmailPanel />);
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.click(screen.getByRole('button', { name: /Send verification link/i }));
    expect(await screen.findByText(/verification link to/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/add-email',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'new@example.com' }),
      }),
    );
  });
});
