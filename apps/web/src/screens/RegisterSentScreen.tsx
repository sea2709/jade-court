/**
 * Post-registration “check your inbox” at `/register/sent`.
 */
import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ResendVerificationButton } from '../components/ResendVerificationButton';
import { useAuth } from '../context/useAuth';

/** Shown after register while email verification is pending. */
export function RegisterSentScreen() {
  const { status, user } = useAuth();

  useEffect(() => {
    document.title = 'Check your inbox · Jade Court';
  }, []);

  if (status === 'loading') {
    return (
      <div className="page-container-sm py-10">
        <p className="text-center text-muted font-semibold">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login?next=%2Fregister%2Fsent" replace />;
  }

  if (user.emailVerified) {
    return <Navigate to="/play" replace />;
  }

  const email = user.email ?? 'your email';

  return (
    <div className="page-container-sm py-10">
      <div className="news-panel mx-auto max-w-md border border-line-soft p-8 shadow-md">
        <h1 className="m-0 mb-2 text-center font-display text-2xl font-extrabold">
          Check your inbox
        </h1>
        <p className="mb-6 text-center text-sm font-semibold text-muted">
          We sent a verification link to <span className="text-ink font-bold">{email}</span>. Open
          it to confirm your address.
        </p>
        <ResendVerificationButton />
        <p className="mt-8 text-center text-sm font-semibold text-muted">
          <Link to="/account" className="text-jade-deep font-bold no-underline hover:underline">
            Account settings
          </Link>
          {' · '}
          <Link to="/play" className="text-jade-deep font-bold no-underline hover:underline">
            Continue to Play
          </Link>
        </p>
      </div>
    </div>
  );
}
