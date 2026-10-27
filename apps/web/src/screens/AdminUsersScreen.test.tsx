import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAdminSession } from '../lib/adminApi';
import { AdminUsersScreen } from './AdminUsersScreen';

const onUnauthorizedMock = vi.fn();

vi.mock('../admin/AdminSessionContext', () => ({
  useAdminSession: () => ({
    username: 'test-admin',
    onUnauthorized: onUnauthorizedMock,
  }),
}));

const fetchMock = vi.fn<typeof fetch>();

const futureExpiry = () => new Date(Date.now() + 60_000).toISOString();

const summaryUser = {
  id: 'user-1',
  email: 'player@example.com',
  displayName: 'Player One',
  emailVerified: true,
  accessUntil: null as string | null,
  createdAt: '2026-01-01T12:00:00.000Z',
};

const detailPayload = {
  user: {
    id: 'user-1',
    email: 'player@example.com',
    emailVerified: true,
    displayName: 'Player One',
    accessUntil: null as string | null,
    preferredModelId: null,
  },
  identities: [{ provider: 'email', sub: 'player@example.com' }],
  access: { active: false, accessUntil: null },
  payments: [],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderUsers(initialEntry = '/admin/users') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/users" element={<AdminUsersScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function searchFor(text: string) {
  if (text) await userEvent.type(screen.getByLabelText(/Search users by email/i), text);
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
}

const listCallUrls = () =>
  fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/api/admin/users?'));

beforeEach(() => {
  setAdminSession({ token: 'tok', username: 'test-admin', expiresAt: futureExpiry() });
  vi.stubGlobal('fetch', fetchMock);
  onUnauthorizedMock.mockReset();
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('AdminUsersScreen', () => {
  it('shows hint until search is entered', () => {
    renderUsers();
    expect(screen.getByText(/Enter an email fragment and press Search/i)).toBeInTheDocument();
  });

  it('does not search while typing; Enter submits the query', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(json({ users: [summaryUser], nextCursor: null })),
    );

    renderUsers();
    const input = screen.getByLabelText(/Search users by email/i);
    await userEvent.type(input, 'player');
    await new Promise((r) => setTimeout(r, 400));
    expect(listCallUrls()).toEqual([]);
    expect(screen.getByText(/Enter an email fragment and press Search/i)).toBeInTheDocument();

    await userEvent.type(input, '{Enter}');
    expect(await screen.findByRole('button', { name: /Player One/i })).toBeInTheDocument();
    expect(listCallUrls()).toEqual(['/api/admin/users?q=player']);
  });

  it('pressing Search again refetches the same query', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(json({ users: [summaryUser], nextCursor: null })),
    );

    renderUsers();
    await searchFor('player');
    await screen.findByRole('button', { name: /Player One/i });
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(listCallUrls()).toHaveLength(2));
    expect(listCallUrls()[1]).toBe('/api/admin/users?q=player');
  });

  it('lists all users when Search is pressed with an empty box, including unverified', async () => {
    const unverified = {
      ...summaryUser,
      id: 'user-2',
      email: 'new@example.com',
      displayName: 'New Player',
      emailVerified: false,
    };
    fetchMock.mockImplementation((url, init) => {
      const path = String(url);
      if (path.includes('/api/admin/users?') && (init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(json({ users: [unverified, summaryUser], nextCursor: null }));
      }
      return Promise.resolve(json({ error: 'not_found' }, 404));
    });

    renderUsers();
    await searchFor('');

    const row = await screen.findByRole('button', { name: /New Player/i });
    expect(row).toHaveTextContent('Unverified');
    expect(screen.getByRole('button', { name: /Player One/i })).toHaveTextContent('Verified');
    expect(listCallUrls()).toEqual(['/api/admin/users?q=']);
  });

  it('says there are no users yet when the full listing is empty', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ users: [], nextCursor: null })));

    renderUsers();
    await searchFor('');

    expect(await screen.findByText('No users yet.')).toBeInTheDocument();
  });

  it('says no users match when a non-empty search is empty', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ users: [], nextCursor: null })));

    renderUsers();
    await searchFor('nobody');

    expect(await screen.findByText('No users match that search.')).toBeInTheDocument();
  });

  it('lists users from search and opens detail', async () => {
    fetchMock.mockImplementation((url, init) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (path.includes('/api/admin/users?') && method === 'GET') {
        return Promise.resolve(json({ users: [summaryUser], nextCursor: null }));
      }
      if (path.endsWith('/api/admin/users/user-1') && method === 'GET') {
        return Promise.resolve(json(detailPayload));
      }
      return Promise.resolve(json({ error: 'not_found' }, 404));
    });

    renderUsers();
    await searchFor('player@');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Player One/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /Player One/i }));

    const detail = await screen.findByRole('region', { name: /User detail/i });
    expect(within(detail).getAllByText('player@example.com').length).toBeGreaterThan(0);
    expect(within(detail).getByText(/Identities/i)).toBeInTheDocument();
  });

  it('grants access with confirmation dialog hours', async () => {
    const grantResponse = {
      user: {
        ...detailPayload.user,
        accessUntil: '2026-12-01T00:00:00.000Z',
      },
      access: { active: true, accessUntil: '2026-12-01T00:00:00.000Z' },
    };

    fetchMock.mockImplementation((url, init) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (path.includes('/api/admin/users?') && method === 'GET') {
        return Promise.resolve(json({ users: [summaryUser], nextCursor: null }));
      }
      if (path.includes('/grant') && method === 'POST') {
        expect(JSON.parse(String(init?.body))).toEqual({ hours: 24 });
        return Promise.resolve(json(grantResponse));
      }
      if (path.endsWith('/api/admin/users/user-1') && method === 'GET') {
        return Promise.resolve(json(detailPayload));
      }
      return Promise.resolve(json({ error: 'not_found' }, 404));
    });

    renderUsers();
    await searchFor('player');
    await userEvent.click(await screen.findByRole('button', { name: /Player One/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Hours')).toHaveValue(24);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm grant' }));

    await waitFor(() => {
      expect(screen.getByText(/Active until/i)).toBeInTheDocument();
    });
  });

  it('revokes access after confirm', async () => {
    const activeDetail = {
      ...detailPayload,
      user: { ...detailPayload.user, accessUntil: '2026-12-01T00:00:00.000Z' },
      access: { active: true, accessUntil: '2026-12-01T00:00:00.000Z' },
    };
    const revokeResponse = {
      user: { ...detailPayload.user, accessUntil: null },
      access: { active: false, accessUntil: null },
    };

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    fetchMock.mockImplementation((url, init) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (path.includes('/api/admin/users?') && method === 'GET') {
        return Promise.resolve(json({ users: [summaryUser], nextCursor: null }));
      }
      if (path.includes('/revoke') && method === 'POST') {
        return Promise.resolve(json(revokeResponse));
      }
      if (path.endsWith('/api/admin/users/user-1') && method === 'GET') {
        return Promise.resolve(json(activeDetail));
      }
      return Promise.resolve(json({ error: 'not_found' }, 404));
    });

    renderUsers();
    await searchFor('player');
    await userEvent.click(await screen.findByRole('button', { name: /Player One/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Revoke access' }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it('clears detail when search changes after selecting a user', async () => {
    const userB = {
      ...summaryUser,
      id: 'user-2',
      email: 'other@example.com',
      displayName: 'Other User',
    };

    fetchMock.mockImplementation((url, init) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (path.includes('/api/admin/users?') && method === 'GET') {
        const q = decodeURIComponent(path.split('q=')[1]?.split('&')[0] ?? '');
        if (q.includes('other')) {
          return Promise.resolve(json({ users: [userB], nextCursor: null }));
        }
        return Promise.resolve(json({ users: [summaryUser], nextCursor: null }));
      }
      if (path.endsWith('/api/admin/users/user-1') && method === 'GET') {
        return Promise.resolve(json(detailPayload));
      }
      return Promise.resolve(json({ error: 'not_found' }, 404));
    });

    renderUsers();
    const input = screen.getByLabelText(/Search users by email/i);
    await searchFor('player');
    await userEvent.click(await screen.findByRole('button', { name: /Player One/i }));
    expect(await screen.findByRole('region', { name: /User detail/i })).toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, 'other@');
    expect(screen.getByRole('region', { name: /User detail/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /User detail/i })).not.toBeInTheDocument();
    });
    expect(await screen.findByRole('button', { name: /Other User/i })).toBeInTheDocument();
  });

  it('ignores stale load-more results after search changes', async () => {
    const userB = {
      ...summaryUser,
      id: 'user-2',
      email: 'other@example.com',
      displayName: 'Other User',
    };
    let resolvePage2: ((v: Response) => void) | undefined;

    fetchMock.mockImplementation((url, init) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (path.includes('/api/admin/users?') && method === 'GET') {
        if (path.includes('cursor=page2')) {
          return new Promise((resolve) => {
            resolvePage2 = resolve;
          });
        }
        const q = decodeURIComponent(path.split('q=')[1]?.split('&')[0] ?? '');
        if (q.includes('other')) {
          return Promise.resolve(json({ users: [userB], nextCursor: null }));
        }
        return Promise.resolve(json({ users: [summaryUser], nextCursor: 'page2' }));
      }
      return Promise.resolve(json({ error: 'not_found' }, 404));
    });

    renderUsers();
    await searchFor('player');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Player One/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await userEvent.clear(screen.getByLabelText(/Search users by email/i));
    await searchFor('other@');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Other User/i })).toBeInTheDocument();
    });

    resolvePage2?.(
      json({
        users: [{ ...summaryUser, id: 'stale-page2', displayName: 'Stale Page Two' }],
        nextCursor: null,
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Stale Page Two/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Other User/i })).toBeInTheDocument();
  });

  it('ignores stale detail when selecting another user before fetch completes', async () => {
    const userB = {
      ...summaryUser,
      id: 'user-2',
      email: 'two@example.com',
      displayName: 'User Two',
    };
    const detailB = {
      ...detailPayload,
      user: {
        ...detailPayload.user,
        id: 'user-2',
        email: 'two@example.com',
        displayName: 'User Two',
      },
    };

    let resolveUser1Detail: ((v: Response) => void) | undefined;

    fetchMock.mockImplementation((url, init) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (path.includes('/api/admin/users?') && method === 'GET') {
        return Promise.resolve(json({ users: [summaryUser, userB], nextCursor: null }));
      }
      if (path.endsWith('/api/admin/users/user-1') && method === 'GET') {
        return new Promise((resolve) => {
          resolveUser1Detail = resolve;
        });
      }
      if (path.endsWith('/api/admin/users/user-2') && method === 'GET') {
        return Promise.resolve(json(detailB));
      }
      return Promise.resolve(json({ error: 'not_found' }, 404));
    });

    renderUsers();
    await searchFor('player');
    await userEvent.click(await screen.findByRole('button', { name: /Player One/i }));
    await userEvent.click(screen.getByRole('button', { name: /User Two/i }));

    const detail = await screen.findByRole('region', { name: /User detail/i });
    await waitFor(() => {
      expect(within(detail).getByText('User Two')).toBeInTheDocument();
    });

    resolveUser1Detail?.(json(detailPayload));
    await waitFor(() => {
      expect(within(detail).queryByText('Player One')).not.toBeInTheDocument();
      expect(within(detail).getByText('User Two')).toBeInTheDocument();
    });
  });

  it('opens user detail from userId query param', async () => {
    fetchMock.mockImplementation((url, init) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (path.endsWith('/api/admin/users/user-1') && method === 'GET') {
        return Promise.resolve(json(detailPayload));
      }
      if (path.includes('/api/admin/users?') && method === 'GET') {
        return Promise.resolve(json({ users: [summaryUser], nextCursor: null }));
      }
      return Promise.resolve(json({ error: 'not_found' }, 404));
    });

    renderUsers('/admin/users?userId=user-1&q=player%40example.com');
    expect(await screen.findByRole('region', { name: /User detail/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Player One/i })).toBeInTheDocument();
  });
});
