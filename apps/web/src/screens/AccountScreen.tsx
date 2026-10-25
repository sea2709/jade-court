/**
 * Player account profile at `/account`.
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { SIGN_OUT_FAILED_MESSAGE, SIGN_OUT_NOTICE } from '../components/AccountAvatarMenu';
import { AccountDayPassCard } from '../components/account/AccountDayPassCard';
import { UnfinishedGamesSection } from '../components/account/UnfinishedGamesSection';
import { PaymentHistoryTable } from '../components/account/PaymentHistoryTable';
import { useAuth } from '../context/useAuth';
import { fetchBillingPayments, type PublicPayment } from '../lib/billingApi';
import {
  deleteActiveGame,
  fetchActiveGames,
  type ActiveGameSummary,
  type SavedGameMode,
} from '../lib/gamesApi';
import { ResendVerificationButton } from '../components/ResendVerificationButton';
import { playerLogout } from '../lib/playerAuthApi';

/** Signed-in profile and sign out. */
export function AccountScreen() {
  const { status, user, access, clearAuth } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [payments, setPayments] = useState<PublicPayment[]>([]);
  const [unfinishedGames, setUnfinishedGames] = useState<ActiveGameSummary[]>([]);
  const [abandonBusyMode, setAbandonBusyMode] = useState<SavedGameMode | null>(null);

  useEffect(() => {
    document.title = 'Account · Jade Court';
  }, []);

  useEffect(() => {
    if (status !== 'ready' || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const { payments: rows } = await fetchBillingPayments();
        if (!cancelled) setPayments(rows);
      } catch {
        if (!cancelled) setPayments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, user]);

  useEffect(() => {
    if (status !== 'ready' || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const { games } = await fetchActiveGames();
        if (!cancelled) setUnfinishedGames(games);
      } catch {
        if (!cancelled) setUnfinishedGames([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, user]);

  const onAbandonGame = async (mode: SavedGameMode) => {
    setAbandonBusyMode(mode);
    try {
      await deleteActiveGame(mode);
      setUnfinishedGames((rows) => rows.filter((g) => g.mode !== mode));
    } finally {
      setAbandonBusyMode(null);
    }
  };

  if (status === 'loading') {
    return (
      <div className="page-container-sm py-10">
        <p className="text-center text-muted font-semibold">Loading account…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login?next=%2Faccount" replace />;
  }

  const name = user.displayName?.trim() || 'Player';
  const accessUntil = access.accessUntil ?? user.accessUntil;

  const onSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      await playerLogout();
      clearAuth();
      navigate('/play-ai', { state: { notice: SIGN_OUT_NOTICE } });
    } catch {
      setSignOutError(SIGN_OUT_FAILED_MESSAGE);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="page-container-sm py-10">
      <div className="rise section-header mb-8">
        <span className="pill pill-jade mb-3.5">Account · 帳</span>
        <h1 className="section-title">Your account</h1>
        <p className="section-subtitle">Profile, billing, and any games you have in progress.</p>
      </div>
      <div className="news-panel border border-line-soft p-8 shadow-md max-w-lg">
        {!user.emailVerified ? (
          <div
            className="mb-6 rounded-[var(--r-md)] border border-line-soft bg-[#FBEAC4] p-4"
            role="region"
            aria-label="Email verification"
          >
            <p className="m-0 mb-3 text-sm font-semibold text-ink">
              Verify your email to unlock billing and other account features.
            </p>
            <ResendVerificationButton />
          </div>
        ) : null}
        <dl className="m-0 flex flex-col gap-4 text-sm font-semibold">
          <div>
            <dt className="text-muted mb-1">Display name</dt>
            <dd className="m-0 text-ink font-bold text-base">{name}</dd>
          </div>
          <div>
            <dt className="text-muted mb-1">Email</dt>
            <dd className="m-0 text-ink font-bold text-base">{user.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted mb-1">Email verified</dt>
            <dd className="m-0 text-ink font-bold text-base">
              {user.emailVerified ? 'Yes' : 'Not yet'}
            </dd>
          </div>
        </dl>
        {signOutError ? (
          <p className="mt-6 text-sm font-bold text-red-deep" role="alert">
            {signOutError}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={signingOut}
            onClick={() => void onSignOut()}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
          <Link to="/play" className="btn btn-primary">
            Play vs Computer
          </Link>
        </div>
      </div>
      <UnfinishedGamesSection
        games={unfinishedGames}
        onAbandon={(mode) => void onAbandonGame(mode)}
        abandonBusyMode={abandonBusyMode}
      />
      <AccountDayPassCard
        accessUntil={accessUntil}
        emailVerified={user.emailVerified}
        hasEmail={user.email != null && user.email.trim() !== ''}
        payments={payments}
      />
      <PaymentHistoryTable payments={payments} />
    </div>
  );
}
