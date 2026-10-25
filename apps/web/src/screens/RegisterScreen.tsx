/**
 * Player registration at `/register`.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton';
import { useAuthProviders } from '../hooks/useAuthProviders';
import { useAuth } from '../context/useAuth';
import { googleSignInProviderId, oauthErrorMessage } from '../lib/oauthAuthApi';
import { PlayerAuthApiError, playerRegister } from '../lib/playerAuthApi';

function registerErrorMessage(err: unknown): string {
  if (!(err instanceof PlayerAuthApiError)) {
    return 'Something went wrong. Try again.';
  }
  switch (err.code) {
    case 'email_taken':
      return 'That email is already registered. Sign in instead.';
    case 'invalid_request':
      return 'Check your display name and email, and use a password of at least 8 characters.';
    case 'rate_limited':
      return 'Too many attempts. Try again in a few minutes.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/** Visual asterisk for required fields; screen readers get `required` from the input instead. */
function RequiredMark() {
  return (
    <span data-required-mark aria-hidden="true" className="text-red-deep">
      *
    </span>
  );
}

/** Create a player account with email and password. */
export function RegisterScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get('oauth_error');
  const { status, user, setSignedIn, refresh } = useAuth();
  const { providers, loading: providersLoading } = useAuthProviders();
  const googleProvider = googleSignInProviderId(providers);
  const oauthReturnTo = '/play';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Create account · Jade Court';
  }, []);

  useEffect(() => {
    if (status === 'ready' && user) {
      navigate(user.emailVerified ? '/play' : '/register/sent', { replace: true });
    }
  }, [status, user, navigate]);

  useEffect(() => {
    if (status === 'ready' && user && oauthError) {
      void refresh();
    }
  }, [status, user, oauthError, refresh]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedDisplayName = displayName.trim();
    if (!trimmedDisplayName || !trimmedEmail || !password) {
      setError('Enter your display name, email, and password.');
      return;
    }
    if (password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const signedIn = await playerRegister(trimmedEmail, password, trimmedDisplayName);
      setSignedIn(signedIn);
      navigate('/register/sent', { replace: true });
    } catch (err) {
      setError(registerErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container-sm py-10">
      <div className="news-panel mx-auto max-w-md border border-line-soft p-8 shadow-md">
        <h1 className="m-0 mb-2 text-center font-display text-2xl font-extrabold">
          Create account
        </h1>
        <p className="mb-6 text-center text-sm font-semibold text-muted">
          Free to join — your games sync when you sign in.
        </p>
        {oauthError ? (
          <p className="mb-4 text-sm font-bold text-red-deep" role="alert">
            {oauthErrorMessage(oauthError)}
          </p>
        ) : null}
        <p className="mb-4 text-xs font-semibold text-muted">
          <RequiredMark /> Required field
        </p>
        {!providersLoading && googleProvider ? (
          <div className="mb-4 flex flex-col gap-4">
            <GoogleSignInButton provider={googleProvider} returnTo={oauthReturnTo} />
            <p className="m-0 text-center text-xs font-bold uppercase tracking-wide text-muted">
              or create account with email
            </p>
          </div>
        ) : null}
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <label
            htmlFor="register-display-name"
            className="flex flex-col gap-2 text-sm font-bold text-ink-soft"
          >
            <span>
              Display name <RequiredMark />
            </span>
            <input
              id="register-display-name"
              name="displayName"
              type="text"
              autoComplete="nickname"
              required
              maxLength={64}
              className="room-link-input w-full text-left font-body"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label
            htmlFor="register-email"
            className="flex flex-col gap-2 text-sm font-bold text-ink-soft"
          >
            <span>
              Email <RequiredMark />
            </span>
            <input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="room-link-input w-full text-left font-body"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label
            htmlFor="register-password"
            className="flex flex-col gap-2 text-sm font-bold text-ink-soft"
          >
            <span>
              Password <RequiredMark />
            </span>
            <input
              id="register-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="room-link-input w-full text-left font-body"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? (
            <p className="text-sm font-bold text-red-deep" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm font-semibold text-muted">
          Already have an account?{' '}
          <Link to="/login" className="text-jade-deep font-bold no-underline hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
