import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

const fetchMock = vi.fn<typeof fetch>();

function Probe() {
  const { status, user } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? 'guest'}</span>
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('AuthProvider', () => {
  it('loads /api/me on mount with credentials', async () => {
    fetchMock.mockResolvedValue(
      json({
        user: {
          id: '1',
          email: 'p@example.com',
          emailVerified: false,
          displayName: null,
          accessUntil: null,
          preferredModelId: null,
        },
        access: { active: false, accessUntil: null },
      }),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('email')).toHaveTextContent('p@example.com');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('useAuth throws outside provider', () => {
    expect(() => render(<Probe />)).toThrow(/AuthProvider/);
  });
});
