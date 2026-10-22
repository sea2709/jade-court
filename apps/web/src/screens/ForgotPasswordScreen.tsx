/**
 * Password reset request at `/forgot-password`.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PlayerAuthApiError, playerForgotPassword } from '../lib/playerAuthApi';

const SUCCESS_COPY =
  'If an account exists for that email, we sent a link to reset your password. Check your inbox.';

function forgotErrorMessage(err: unknown): string {
  if (!(err instanceof PlayerAuthApiError)) {
    return 'Something went wrong. Try again.';
  }
  switch (err.code) {
    case 'invalid_request':
      return 'Enter a valid email address.';
    case 'rate_limited':
      return 'Too many attempts. Try again in a few minutes.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/** Request a password reset email (same success message either way). */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Forgot password · Jade Court';
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email address.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await playerForgotPassword(trimmed);
      setSubmitted(true);
    } catch (err) {
      setError(forgotErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container-sm py-10">
      <div className="news-panel mx-auto max-w-md border border-line-soft p-8 shadow-md">
        <h1 className="m-0 mb-2 text-center font-display text-2xl font-extrabold">
          Forgot password
        </h1>
        <p className="mb-6 text-center text-sm font-semibold text-muted">
          Enter your email and we&apos;ll send a reset link if you have a password on file.
        </p>
        {submitted ? (
          <p className="text-center text-sm font-semibold text-muted" role="status">
            {SUCCESS_COPY}
          </p>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
            <label
              htmlFor="forgot-email"
              className="flex flex-col gap-2 text-sm font-bold text-ink-soft"
            >
              Email
              <input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="email"
                className="room-link-input w-full text-left font-body"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error ? (
              <p className="text-sm font-bold text-red-deep" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm font-semibold text-muted">
          <Link to="/login" className="text-jade-deep font-bold no-underline hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
