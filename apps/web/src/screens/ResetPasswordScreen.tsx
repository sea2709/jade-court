/**
 * New password form at `/reset-password?token=…`.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { PlayerAuthApiError, playerResetPassword } from '../lib/playerAuthApi';

function resetErrorMessage(err: unknown): string {
  if (!(err instanceof PlayerAuthApiError)) {
    return 'Something went wrong. Try again.';
  }
  switch (err.code) {
    case 'invalid_token':
      return 'This reset link is invalid or expired. Request a new one.';
    case 'invalid_request':
      return 'Use a password of at least 8 characters.';
    case 'rate_limited':
      return 'Too many attempts. Try again in a few minutes.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/** Sets a new password from email reset token and signs the user in. */
export function ResetPasswordScreen() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const navigate = useNavigate();
  const { setSignedIn } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(token ? null : 'This link is missing a token.');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Reset password · Jade Court';
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('This link is missing a token.');
      return;
    }
    if (password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const user = await playerResetPassword(token, password);
      setSignedIn(user);
      navigate('/play', { replace: true });
    } catch (err) {
      setError(resetErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container-sm py-10">
      <div className="news-panel mx-auto max-w-md border border-line-soft p-8 shadow-md">
        <h1 className="m-0 mb-2 text-center font-display text-2xl font-extrabold">
          Reset password
        </h1>
        <p className="mb-6 text-center text-sm font-semibold text-muted">
          Choose a new password for your account.
        </p>
        {!token ? (
          <p className="text-center text-sm font-bold text-red-deep" role="alert">
            {error}
          </p>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
            <label
              htmlFor="reset-password"
              className="flex flex-col gap-2 text-sm font-bold text-ink-soft"
            >
              New password
              <input
                id="reset-password"
                name="password"
                type="password"
                autoComplete="new-password"
                className="room-link-input w-full text-left font-body"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label
              htmlFor="reset-password-confirm"
              className="flex flex-col gap-2 text-sm font-bold text-ink-soft"
            >
              Confirm password
              <input
                id="reset-password-confirm"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                className="room-link-input w-full text-left font-body"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {error ? (
              <p className="text-sm font-bold text-red-deep" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm font-semibold text-muted">
          <Link
            to="/forgot-password"
            className="text-jade-deep font-bold no-underline hover:underline"
          >
            Request a new link
          </Link>
          {' · '}
          <Link to="/login" className="text-jade-deep font-bold no-underline hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
