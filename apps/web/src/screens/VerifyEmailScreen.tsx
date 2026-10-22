/**
 * Email verification landing at `/verify-email?token=…`.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import {
  PlayerAuthApiError,
  playerLogout,
  playerVerifyEmail,
  type PublicUser,
} from '../lib/playerAuthApi';

/** One in-flight verify per token (React StrictMode runs effects twice in dev). */
const verifyEmailOnceByToken = new Map<string, Promise<PublicUser>>();

function verifyEmailOnce(token: string): Promise<PublicUser> {
  let pending = verifyEmailOnceByToken.get(token);
  if (!pending) {
    pending = playerVerifyEmail(token).finally(() => {
      verifyEmailOnceByToken.delete(token);
    });
    verifyEmailOnceByToken.set(token, pending);
  }
  return pending;
}

type VerifyPhase = 'idle' | 'working' | 'success' | 'error';

const WRONG_ACCOUNT_MESSAGE =
  'This verification link is for a different account. Sign out, then open the link again (or use a private window).';

type VerifyUiHandlers = {
  setPhase: (phase: VerifyPhase) => void;
  setError: (message: string | null) => void;
  setShowWrongAccountSignOut: (show: boolean) => void;
};

async function performEmailVerification(
  verifyToken: string,
  sessionUserId: string | null,
  refresh: () => Promise<{ user: PublicUser | null }>,
  ui: VerifyUiHandlers,
): Promise<void> {
  if (!verifyToken) {
    ui.setPhase('error');
    ui.setError('This link is missing a token.');
    ui.setShowWrongAccountSignOut(false);
    return;
  }
  ui.setPhase('working');
  ui.setError(null);
  ui.setShowWrongAccountSignOut(false);
  try {
    const verifyUser = await verifyEmailOnce(verifyToken);
    if (sessionUserId != null && sessionUserId !== verifyUser.id) {
      await refresh();
      ui.setPhase('error');
      ui.setError(WRONG_ACCOUNT_MESSAGE);
      ui.setShowWrongAccountSignOut(true);
      return;
    }
    const me = await refresh();
    if (!me.user?.emailVerified) {
      ui.setPhase('error');
      ui.setError(WRONG_ACCOUNT_MESSAGE);
      ui.setShowWrongAccountSignOut(Boolean(me.user));
      return;
    }
    ui.setPhase('success');
  } catch (err) {
    ui.setPhase('error');
    ui.setError(verifyErrorMessage(err));
    ui.setShowWrongAccountSignOut(
      err instanceof PlayerAuthApiError && err.code === 'wrong_account',
    );
  }
}

function verifyErrorMessage(err: unknown): string {
  if (!(err instanceof PlayerAuthApiError)) {
    return 'Something went wrong. Try again.';
  }
  switch (err.code) {
    case 'wrong_account':
      return WRONG_ACCOUNT_MESSAGE;
    case 'invalid_token':
      return 'This link is invalid or expired. Request a new verification email from your account.';
    case 'invalid_request':
      return 'This link is missing a token.';
    case 'rate_limited':
      return 'Too many attempts. Try again in a few minutes.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/** Verifies email from query token and reconciles UI with the session cookie via `/api/me`. */
export function VerifyEmailScreen() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const { status, user, refresh, clearAuth } = useAuth();
  const [phase, setPhase] = useState<VerifyPhase>(token ? 'idle' : 'error');
  const [error, setError] = useState<string | null>(token ? null : 'This link is missing a token.');
  const [showWrongAccountSignOut, setShowWrongAccountSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const autoVerifyStartedForToken = useRef<string | null>(null);

  useEffect(() => {
    document.title = 'Verify email · Jade Court';
  }, []);

  useEffect(() => {
    autoVerifyStartedForToken.current = null;
  }, [token]);

  const verifyUi: VerifyUiHandlers = {
    setPhase,
    setError,
    setShowWrongAccountSignOut,
  };

  const runVerification = (verifyToken: string) =>
    performEmailVerification(verifyToken, user?.id ?? null, refresh, verifyUi);

  useEffect(() => {
    if (!token || status !== 'ready') return;
    if (autoVerifyStartedForToken.current === token) return;
    autoVerifyStartedForToken.current = token;
    let cancelled = false;
    const sessionUserId = user?.id ?? null;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await performEmailVerification(token, sessionUserId, refresh, {
        setPhase,
        setError,
        setShowWrongAccountSignOut,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [token, status, refresh, user?.id]);

  const onSignOutForWrongAccount = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await playerLogout();
      clearAuth();
      setShowWrongAccountSignOut(false);
      setError(
        'Signed out. Open this verification link again to finish verifying the correct account.',
      );
    } catch {
      setError('Could not sign out. Try again from Account, then reopen this link.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="page-container-sm py-10">
      <div className="news-panel mx-auto max-w-md border border-line-soft p-8 shadow-md">
        <h1 className="m-0 mb-2 text-center font-display text-2xl font-extrabold">Verify email</h1>
        {phase === 'working' || (token && status === 'loading') ? (
          <p className="text-center text-sm font-semibold text-muted" role="status">
            Confirming your email…
          </p>
        ) : null}
        {phase === 'success' ? (
          <>
            <p className="mb-6 text-center text-sm font-semibold text-muted" role="status">
              Your email is verified. You&apos;re all set.
            </p>
            <Link to="/play" className="btn btn-primary w-full text-center no-underline">
              Play vs Computer
            </Link>
            <p className="mt-6 text-center text-sm font-semibold text-muted">
              <Link to="/account" className="text-jade-deep font-bold no-underline hover:underline">
                Account
              </Link>
            </p>
          </>
        ) : null}
        {phase === 'error' ? (
          <>
            {error ? (
              <p className="mb-6 text-center text-sm font-bold text-red-deep" role="alert">
                {error}
              </p>
            ) : null}
            {showWrongAccountSignOut ? (
              <button
                type="button"
                className="btn btn-primary w-full mb-4"
                disabled={signingOut}
                onClick={() => void onSignOutForWrongAccount()}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            ) : null}
            {token && !showWrongAccountSignOut ? (
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => void runVerification(token)}
              >
                Try again
              </button>
            ) : null}
            <p className="mt-6 text-center text-sm font-semibold text-muted">
              <Link to="/account" className="text-jade-deep font-bold no-underline hover:underline">
                Account
              </Link>
              {' · '}
              <Link to="/login" className="text-jade-deep font-bold no-underline hover:underline">
                Sign in
              </Link>
            </p>
          </>
        ) : null}
        {phase === 'idle' && token ? (
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => void runVerification(token)}
          >
            Verify email
          </button>
        ) : null}
      </div>
    </div>
  );
}
