/**
 * Day-pass status and checkout on the account page.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlayAccessClock } from '../../hooks/usePlayAccessClock';
import {
  dayPassWindowProgress,
  formatAccessCountdownShort,
  formatAccessEndDateTime,
} from '../../lib/formatAccessUntil';
import type { PublicPayment } from '../../lib/billingApi';
import { assignCheckoutUrl, BillingApiError, postBillingCheckout } from '../../lib/billingApi';

const DAY_PASS_MS = 24 * 60 * 60 * 1000;

export interface AccountDayPassCardProps {
  accessUntil: string | null;
  emailVerified: boolean;
  hasEmail: boolean;
  payments: PublicPayment[];
}

function resolveGrantWindow(
  accessUntil: string,
  payments: PublicPayment[],
): { from: string; until: string } {
  const match = payments.find((p) => p.status === 'paid' && p.grantedUntil === accessUntil);
  if (match) {
    return { from: match.grantedFrom, until: match.grantedUntil };
  }
  const end = Date.parse(accessUntil);
  return {
    from: new Date(end - DAY_PASS_MS).toISOString(),
    until: accessUntil,
  };
}

/** Active or inactive day pass with progress, checkout, and play link. */
export function AccountDayPassCard({
  accessUntil,
  emailVerified,
  hasEmail,
  payments,
}: AccountDayPassCardProps) {
  const { active, now } = usePlayAccessClock(accessUntil);
  const [, minuteTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => minuteTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grantWindow = useMemo(
    () => (accessUntil && active ? resolveGrantWindow(accessUntil, payments) : null),
    [accessUntil, active, payments],
  );

  const countdown = active ? formatAccessCountdownShort(accessUntil, now) : null;
  const endLabel = active ? formatAccessEndDateTime(accessUntil) : null;
  const progress =
    grantWindow != null ? dayPassWindowProgress(grantWindow.from, grantWindow.until, now) : null;

  const grantStartLabel = grantWindow != null ? formatAccessEndDateTime(grantWindow.from) : null;

  const billingBlocked = !hasEmail
    ? 'Add an email to your account before purchasing a day pass.'
    : !emailVerified
      ? 'Verify your email before purchasing a day pass.'
      : null;

  const onCheckout = async () => {
    if (billingBlocked) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await postBillingCheckout();
      assignCheckoutUrl(url);
    } catch (err) {
      if (err instanceof BillingApiError && err.status === 503) {
        setError('Checkout is not available right now. Try again later.');
      } else if (err instanceof BillingApiError && err.code === 'email_not_verified') {
        setError('Verify your email before purchasing a day pass.');
      } else {
        setError('Could not start checkout. Check your connection and try again.');
      }
      setBusy(false);
    }
  };

  const buyLabel = active ? 'Add 24 hours · $1' : 'Buy day pass · $1';

  return (
    <section
      className="news-panel border border-line-soft p-8 shadow-md max-w-lg mt-8"
      aria-labelledby="account-day-pass-heading"
    >
      <h2
        id="account-day-pass-heading"
        className="m-0 mb-1 font-display text-xl font-extrabold text-ink"
      >
        {active ? 'Day pass · Active' : 'Day pass'}
      </h2>
      {active ? (
        <>
          {countdown ? (
            <p className="m-0 mt-2 text-lg font-bold text-jade-deep">{countdown}</p>
          ) : null}
          {endLabel ? (
            <p className="m-0 mt-1 text-sm font-semibold text-muted">Ends {endLabel}</p>
          ) : null}
          {grantStartLabel && progress != null ? (
            <div className="mt-5">
              <div className="flex justify-between text-xs font-bold text-muted mb-1.5">
                <span>{grantStartLabel}</span>
                <span>24 hours</span>
              </div>
              <div
                className="h-2 rounded-full bg-line-soft overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                aria-label="Day pass time used"
              >
                <div
                  className="h-full rounded-full bg-jade transition-[width] duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
                />
              </div>
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || Boolean(billingBlocked)}
              onClick={() => void onCheckout()}
            >
              {busy ? 'Opening checkout…' : buyLabel}
            </button>
            <Link to="/play-ai" className="btn btn-ghost border border-line-soft">
              Play with AI
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 mt-2 text-sm font-semibold text-muted">No active day pass</p>
          <div className="mt-6">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || Boolean(billingBlocked)}
              onClick={() => void onCheckout()}
            >
              {busy ? 'Opening checkout…' : buyLabel}
            </button>
          </div>
        </>
      )}
      {billingBlocked ? (
        <p className="mt-4 m-0 text-sm font-semibold text-ink-soft" role="status">
          {billingBlocked}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 m-0 text-sm font-bold text-red-deep" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
