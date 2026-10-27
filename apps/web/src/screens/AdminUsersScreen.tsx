/**
 * Admin player lookup, access grant/revoke at `/admin/users`.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminSession } from '../admin/AdminSessionContext';
import { formatAdminAmount, formatAdminDateTime, formatPaymentStatus } from '../lib/adminFormat';
import {
  AdminUsersApiError,
  DEFAULT_GRANT_ACCESS_HOURS,
  fetchAdminUserDetail,
  grantAdminUserAccess,
  MAX_PLAY_AI_ACCESS_HOURS,
  revokeAdminUserAccess,
  searchAdminUsers,
  type AdminUserDetailResponse,
  type AdminUserSummary,
} from '../lib/adminUsersApi';

function adminErrorMessage(err: unknown): string {
  if (!(err instanceof AdminUsersApiError)) {
    return 'Something went wrong. Try again.';
  }
  switch (err.code) {
    case 'admin_disabled':
      return 'Admin is disabled on this server.';
    case 'invalid_query':
      return 'Enter an email search term.';
    case 'invalid_request':
      return 'Invalid grant hours.';
    case 'user_not_found':
      return 'User not found.';
    case 'unauthorized':
      return 'Session expired.';
    default:
      return err.message || 'Request failed.';
  }
}

function userLabel(user: AdminUserSummary): string {
  return user.displayName?.trim() || user.email || user.id;
}

/** Admin user search, detail, and Play AI access controls. */
export function AdminUsersScreen() {
  const { onUnauthorized } = useAdminSession();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  /**
   * Query from the last Search submit; `null` until the first one. An empty `q` lists every
   * user. A new object per submit so pressing Search again refetches the same query.
   */
  const [submitted, setSubmitted] = useState<{ q: string } | null>(() => {
    const q = (searchParams.get('q') ?? '').trim();
    return q ? { q } : null;
  });
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [grantOpen, setGrantOpen] = useState(false);
  const [grantHours, setGrantHours] = useState(String(DEFAULT_GRANT_ACCESS_HOURS));
  const [grantError, setGrantError] = useState<string | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);

  /** Bumped on each Search submit so in-flight list requests are ignored. */
  const listRequestGen = useRef(0);
  /** Bumped on each detail fetch / selection clear so stale profile responses are ignored. */
  const detailRequestGen = useRef(0);
  /** One-shot user id from `?userId=` to open detail without clearing on that search tick. */
  const pendingDeepLinkUserId = useRef<string | null>(searchParams.get('userId'));
  const selectedIdRef = useRef<string | null>(null);

  const clearSelection = useCallback(() => {
    detailRequestGen.current += 1;
    selectedIdRef.current = null;
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    setGrantOpen(false);
    setGrantError(null);
  }, []);

  useEffect(() => {
    document.title = 'Users · Jade Court Admin';
  }, []);

  const handleApiError = useCallback(
    (err: unknown): boolean => {
      if (err instanceof AdminUsersApiError && err.code === 'unauthorized') {
        onUnauthorized();
        return true;
      }
      return false;
    },
    [onUnauthorized],
  );

  const loadDetail = useCallback(
    async (userId: string) => {
      detailRequestGen.current += 1;
      const gen = detailRequestGen.current;
      setDetailLoading(true);
      setDetailError(null);
      setDetail(null);
      try {
        const res = await fetchAdminUserDetail(userId);
        if (gen !== detailRequestGen.current) return;
        setDetail(res);
      } catch (err) {
        if (gen !== detailRequestGen.current) return;
        if (handleApiError(err)) return;
        setDetailError(adminErrorMessage(err));
        setDetail(null);
      } finally {
        if (gen === detailRequestGen.current) setDetailLoading(false);
      }
    },
    [handleApiError],
  );

  const selectUser = useCallback(
    (userId: string) => {
      selectedIdRef.current = userId;
      setSelectedId(userId);
      setGrantOpen(false);
      setGrantError(null);
      void loadDetail(userId);
    },
    [loadDetail],
  );

  const loadList = useCallback(
    async (opts?: { cursor?: string; append?: boolean }) => {
      const q = submitted?.q;
      const gen = listRequestGen.current;
      if (q === undefined) {
        if (gen !== listRequestGen.current) return;
        setUsers([]);
        setListCursor(null);
        setListError(null);
        return;
      }
      setListLoading(true);
      setListError(null);
      try {
        const res = await searchAdminUsers({ q, cursor: opts?.cursor });
        if (gen !== listRequestGen.current) return;
        setUsers((prev) => (opts?.append ? [...prev, ...res.users] : res.users));
        setListCursor(res.nextCursor);
      } catch (err) {
        if (gen !== listRequestGen.current) return;
        if (handleApiError(err)) return;
        setListError(adminErrorMessage(err));
        if (!opts?.append) setUsers([]);
      } finally {
        if (gen === listRequestGen.current) setListLoading(false);
      }
    },
    [submitted, handleApiError],
  );

  useEffect(() => {
    listRequestGen.current += 1;
    const gen = listRequestGen.current;
    const deepLinkUserId = pendingDeepLinkUserId.current;
    pendingDeepLinkUserId.current = null;
    if (!deepLinkUserId) {
      clearSelection();
    }

    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled || gen !== listRequestGen.current) return;

      if (!submitted) {
        setUsers([]);
        setListCursor(null);
        setListError(null);
        if (deepLinkUserId && gen === listRequestGen.current) {
          selectUser(deepLinkUserId);
        }
        return;
      }

      setListLoading(true);
      setListError(null);
      try {
        const res = await searchAdminUsers({ q: submitted.q });
        if (cancelled || gen !== listRequestGen.current) return;
        setUsers(res.users);
        setListCursor(res.nextCursor);
        if (deepLinkUserId && gen === listRequestGen.current) {
          selectUser(deepLinkUserId);
        } else {
          await Promise.resolve();
          if (gen !== listRequestGen.current) return;
          const currentId = selectedIdRef.current;
          if (currentId && res.users.length > 0 && !res.users.some((u) => u.id === currentId)) {
            clearSelection();
            selectedIdRef.current = null;
          }
        }
      } catch (err) {
        if (cancelled || gen !== listRequestGen.current) return;
        if (handleApiError(err)) return;
        setListError(adminErrorMessage(err));
        setUsers([]);
      } finally {
        if (!cancelled && gen === listRequestGen.current) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submitted, clearSelection, handleApiError, selectUser]);

  useEffect(() => {
    const userId = searchParams.get('userId');
    const q = searchParams.get('q');
    if (!userId && !q) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (q) {
        setSearch(q);
        const trimmed = q.trim();
        setSubmitted((prev) => (prev?.q === trimmed ? prev : { q: trimmed }));
      }
      if (userId) {
        pendingDeepLinkUserId.current = userId;
        if (!q) selectUser(userId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, selectUser]);

  const submitSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted({ q: search.trim() });
  };

  const openGrantDialog = () => {
    setGrantHours(String(DEFAULT_GRANT_ACCESS_HOURS));
    setGrantError(null);
    setGrantOpen(true);
  };

  const closeGrantDialog = () => {
    if (accessBusy) return;
    setGrantOpen(false);
    setGrantError(null);
  };

  const confirmGrant = async () => {
    if (!selectedId || accessBusy) return;
    const hours = Number(grantHours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_PLAY_AI_ACCESS_HOURS) {
      setGrantError(`Enter hours between 1 and ${MAX_PLAY_AI_ACCESS_HOURS}.`);
      return;
    }
    setAccessBusy(true);
    setGrantError(null);
    try {
      const res = await grantAdminUserAccess(selectedId, hours);
      setDetail((d) =>
        d
          ? {
              ...d,
              user: res.user,
              access: res.access,
            }
          : d,
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedId ? { ...u, accessUntil: res.user.accessUntil } : u)),
      );
      setGrantOpen(false);
    } catch (err) {
      if (handleApiError(err)) return;
      setGrantError(adminErrorMessage(err));
    } finally {
      setAccessBusy(false);
    }
  };

  const confirmRevoke = async () => {
    if (!selectedId || accessBusy) return;
    if (!window.confirm('Revoke Play AI access for this user?')) return;
    setAccessBusy(true);
    setDetailError(null);
    try {
      const res = await revokeAdminUserAccess(selectedId);
      setDetail((d) =>
        d
          ? {
              ...d,
              user: res.user,
              access: res.access,
            }
          : d,
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedId ? { ...u, accessUntil: res.user.accessUntil } : u)),
      );
    } catch (err) {
      if (handleApiError(err)) return;
      setDetailError(adminErrorMessage(err));
    } finally {
      setAccessBusy(false);
    }
  };

  return (
    <div>
      <h1 className="m-0 mb-2 font-display text-3xl font-extrabold">Users</h1>
      <p className="mb-6 text-base font-semibold text-ink-soft">
        Search by email, inspect accounts, and grant or revoke Play AI access.
      </p>

      <form
        role="search"
        className="mb-6 flex flex-wrap items-center gap-2"
        onSubmit={submitSearch}
      >
        <input
          type="search"
          placeholder="Search by email…"
          className="room-link-input min-w-0 max-w-md flex-1 text-left font-body"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users by email"
        />
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {listError ? (
        <p className="mb-4 text-sm font-bold text-red-deep" role="alert">
          {listError}
        </p>
      ) : null}

      {!submitted ? (
        <p className="text-sm font-semibold text-muted">
          Enter an email fragment and press Search. Leave it empty to list all users.
        </p>
      ) : listLoading && users.length === 0 ? (
        <p className="text-sm font-semibold text-muted">Searching…</p>
      ) : users.length === 0 ? (
        <p className="text-sm font-semibold text-muted">
          {submitted.q ? 'No users match that search.' : 'No users yet.'}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {users.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                className={`w-full rounded-[16px] border px-4 py-3 text-left transition-colors ${
                  selectedId === user.id
                    ? 'border-jade bg-jade-soft/40'
                    : 'border-line-soft bg-paper hover:border-jade/50'
                }`}
                onClick={() => selectUser(user.id)}
                aria-pressed={selectedId === user.id}
              >
                <div className="font-display text-lg font-extrabold text-ink">
                  {userLabel(user)}
                </div>
                <div className="text-sm font-semibold text-muted">
                  {user.email ?? 'No email'} · {user.emailVerified ? 'Verified' : 'Unverified'} ·
                  Joined {formatAdminDateTime(user.createdAt)}
                </div>
                <div className="text-sm font-semibold text-ink-soft">
                  Access until: {formatAdminDateTime(user.accessUntil)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {listCursor ? (
        <div className="mt-6 text-center">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={listLoading}
            onClick={() => void loadList({ cursor: listCursor, append: true })}
          >
            {listLoading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}

      {selectedId ? (
        <section
          className="news-panel mt-8 border border-line-soft p-6 shadow-md"
          aria-labelledby="admin-user-detail-heading"
          aria-label="User detail"
        >
          <h2
            id="admin-user-detail-heading"
            className="m-0 mb-4 font-display text-xl font-extrabold text-ink"
          >
            User detail
          </h2>

          {detailLoading && !detail ? (
            <p className="text-sm font-semibold text-muted">Loading profile…</p>
          ) : null}

          {detailError ? (
            <p className="mb-4 text-sm font-bold text-red-deep" role="alert">
              {detailError}
            </p>
          ) : null}

          {detail ? (
            <>
              <dl className="m-0 grid gap-2 text-sm font-semibold sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Email</dt>
                  <dd className="m-0 text-ink">{detail.user.email ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Display name</dt>
                  <dd className="m-0 text-ink">{detail.user.displayName ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Email verified</dt>
                  <dd className="m-0 text-ink">{detail.user.emailVerified ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Play AI access</dt>
                  <dd className="m-0 text-ink">
                    {detail.access.active
                      ? `Active until ${formatAdminDateTime(detail.access.accessUntil)}`
                      : 'Inactive'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">User ID</dt>
                  <dd className="m-0 font-mono text-xs text-ink">{detail.user.id}</dd>
                </div>
                <div>
                  <dt className="text-muted">Preferred model</dt>
                  <dd className="m-0 text-ink">{detail.user.preferredModelId ?? '—'}</dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={accessBusy}
                  onClick={openGrantDialog}
                >
                  Grant access
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={accessBusy || !detail.access.active}
                  onClick={() => void confirmRevoke()}
                >
                  Revoke access
                </button>
              </div>

              {detail.identities.length > 0 ? (
                <div className="mt-8">
                  <h3 className="m-0 mb-2 font-display text-lg font-extrabold">Identities</h3>
                  <ul className="m-0 list-none p-0 text-sm font-semibold">
                    {detail.identities.map((id) => (
                      <li key={`${id.provider}:${id.sub}`} className="text-ink">
                        {id.provider} · <span className="font-mono text-xs">{id.sub}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {detail.payments.length > 0 ? (
                <div className="mt-8 overflow-x-auto">
                  <h3 className="m-0 mb-2 font-display text-lg font-extrabold">Recent payments</h3>
                  <table className="w-full border-collapse text-left text-sm font-semibold">
                    <thead>
                      <tr className="border-b border-line-soft text-muted">
                        <th className="py-2 pr-4 font-bold">Date</th>
                        <th className="py-2 pr-4 font-bold">Amount</th>
                        <th className="py-2 pr-4 font-bold">Status</th>
                        <th className="py-2 font-bold">Access window</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.payments.map((p) => (
                        <tr key={p.id} className="border-b border-line-soft last:border-b-0">
                          <td className="py-2 pr-4 text-ink">{formatAdminDateTime(p.createdAt)}</td>
                          <td className="py-2 pr-4 text-ink">
                            {formatAdminAmount(p.amount, p.currency)}
                          </td>
                          <td className="py-2 pr-4 text-ink">{formatPaymentStatus(p.status)}</td>
                          <td className="py-2 text-ink">
                            {formatAdminDateTime(p.grantedFrom)} →{' '}
                            {formatAdminDateTime(p.grantedUntil)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-6 text-sm font-semibold text-muted">No payments for this user.</p>
              )}
            </>
          ) : null}
        </section>
      ) : null}

      {grantOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          role="presentation"
          onClick={closeGrantDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="grant-access-title"
            className="news-panel w-full max-w-md border border-line-soft p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="grant-access-title" className="m-0 mb-2 font-display text-xl font-extrabold">
              Grant Play AI access
            </h2>
            <p className="mb-4 text-sm font-semibold text-ink-soft">
              Extends access from now (or stacks on existing time). Max {MAX_PLAY_AI_ACCESS_HOURS}{' '}
              hours per grant.
            </p>
            <label htmlFor="grant-hours" className="mb-1 block text-sm font-bold text-ink-soft">
              Hours
            </label>
            <input
              id="grant-hours"
              type="number"
              min={1}
              max={MAX_PLAY_AI_ACCESS_HOURS}
              className="room-link-input mb-4 w-full text-left font-body"
              value={grantHours}
              onChange={(e) => setGrantHours(e.target.value)}
            />
            {grantError ? (
              <p className="mb-3 text-sm font-bold text-red-deep" role="alert">
                {grantError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={accessBusy}
                onClick={closeGrantDialog}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={accessBusy}
                onClick={() => void confirmGrant()}
              >
                {accessBusy ? 'Granting…' : 'Confirm grant'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
