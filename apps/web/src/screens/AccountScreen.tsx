/**
 * Player account profile at `/account`.
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { SIGN_OUT_FAILED_MESSAGE, SIGN_OUT_NOTICE } from '../components/AccountAvatarMenu';
import { useAuth } from '../context/useAuth';
import { formatAccessTimeLeft } from '../lib/formatAccessUntil';
import { playerLogout } from '../lib/playerAuthApi';

/** Signed-in profile and sign out. */
export function AccountScreen() {
  const { status, user, access, clearAuth } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Account · Jade Court';
  }, []);

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
  const accessLabel = formatAccessTimeLeft(access.accessUntil ?? user.accessUntil);

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
        <p className="section-subtitle">Profile and session. Saved games will appear here later.</p>
      </div>
      <div className="news-panel border border-line-soft p-8 shadow-md max-w-lg">
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
          {accessLabel ? (
            <div>
              <dt className="text-muted mb-1">Day pass</dt>
              <dd className="m-0 text-ink font-bold text-base">{accessLabel}</dd>
            </div>
          ) : null}
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
    </div>
  );
}
