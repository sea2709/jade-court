/**
 * Admin payment ledger at `/admin/payments`.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminSession } from '../admin/AdminSessionContext';
import { formatAdminAmount, formatAdminDateTime, formatPaymentStatus } from '../lib/adminFormat';
import {
  AdminUsersApiError,
  adminUserDetailPath,
  fetchAdminPayments,
  type AdminPaymentRow,
} from '../lib/adminUsersApi';

function adminErrorMessage(err: unknown): string {
  if (!(err instanceof AdminUsersApiError)) {
    return 'Something went wrong. Try again.';
  }
  switch (err.code) {
    case 'admin_disabled':
      return 'Admin is disabled on this server.';
    case 'unauthorized':
      return 'Session expired.';
    default:
      return err.message || 'Request failed.';
  }
}

/** Paginated table of recent day-pass payments across all users. */
export function AdminPaymentsScreen() {
  const { onUnauthorized } = useAdminSession();

  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Payments · Jade Court Admin';
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

  const loadPayments = useCallback(
    async (opts?: { append?: boolean; nextCursor?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchAdminPayments({ cursor: opts?.nextCursor });
        setPayments((prev) => (opts?.append ? [...prev, ...res.payments] : res.payments));
        setCursor(res.nextCursor);
      } catch (err) {
        if (handleApiError(err)) return;
        setError(adminErrorMessage(err));
        if (!opts?.append) setPayments([]);
      } finally {
        setLoading(false);
      }
    },
    [handleApiError],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchAdminPayments();
        if (!cancelled) {
          setPayments(res.payments);
          setCursor(res.nextCursor);
        }
      } catch (err) {
        if (cancelled) return;
        if (handleApiError(err)) return;
        setError(adminErrorMessage(err));
        setPayments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleApiError]);

  return (
    <div>
      <h1 className="m-0 mb-2 font-display text-3xl font-extrabold">Payments</h1>
      <p className="mb-6 text-base font-semibold text-ink-soft">
        Recent day-pass charges across all players (newest first).
      </p>

      {error ? (
        <p className="mb-4 text-sm font-bold text-red-deep" role="alert">
          {error}
        </p>
      ) : null}

      {loading && payments.length === 0 ? (
        <p className="text-sm font-semibold text-muted">Loading payments…</p>
      ) : payments.length === 0 ? (
        <p className="text-sm font-semibold text-muted">No payments recorded yet.</p>
      ) : (
        <div className="news-panel overflow-x-auto border border-line-soft p-6 shadow-md">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm font-semibold">
            <thead>
              <tr className="border-b border-line-soft text-muted">
                <th className="py-2 pr-4 font-bold">Date</th>
                <th className="py-2 pr-4 font-bold">Amount</th>
                <th className="py-2 pr-4 font-bold">Status</th>
                <th className="py-2 pr-4 font-bold">User</th>
                <th className="py-2 font-bold">Access window</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-line-soft last:border-b-0">
                  <td className="py-3 pr-4 text-ink">{formatAdminDateTime(p.createdAt)}</td>
                  <td className="py-3 pr-4 text-ink">{formatAdminAmount(p.amount, p.currency)}</td>
                  <td className="py-3 pr-4 text-ink">{formatPaymentStatus(p.status)}</td>
                  <td className="py-3 pr-4 text-ink">
                    <Link
                      to={adminUserDetailPath(p.userId, { q: p.userEmail })}
                      className="font-bold text-jade-deep no-underline hover:underline"
                    >
                      {p.userEmail ?? 'View user'}
                    </Link>
                    <div className="font-mono text-xs text-muted">
                      <Link
                        to={adminUserDetailPath(p.userId, { q: p.userEmail })}
                        className="text-muted no-underline hover:text-jade-deep hover:underline"
                      >
                        {p.userId}
                      </Link>
                    </div>
                  </td>
                  <td className="py-3 text-ink">
                    {formatAdminDateTime(p.grantedFrom)} → {formatAdminDateTime(p.grantedUntil)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cursor ? (
        <div className="mt-6 text-center">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading}
            onClick={() => void loadPayments({ append: true, nextCursor: cursor })}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
