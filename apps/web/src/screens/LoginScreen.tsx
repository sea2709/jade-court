/**
 * Player sign-in at `/login`.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { OAuthSignInButtons } from '../components/auth/OAuthSignInButtons';
import { useAuthProviders } from '../hooks/useAuthProviders';
import { useAuth } from '../context/useAuth';
import {
  facebookSignInProviderId,
  googleSignInProviderId,
  oauthErrorMessage,
} from '../lib/oauthAuthApi';
import { PlayerAuthApiError, playerLogin } from '../lib/playerAuthApi';
import { safeLoginNextPath } from '../lib/safeReturnTo';

function loginErrorMessage(err: unknown): string {
  if (!(err instanceof PlayerAuthApiError)) {
    return 'Something went wrong. Try again.';
  }
  switch (err.code) {
    case 'invalid_credentials':
      return 'Invalid email or password.';
    case 'rate_limited':
      return 'Too many attempts. Try again in a few minutes.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/** Email/password login for player accounts. */
export function LoginScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeLoginNextPath(searchParams.get('next'));
  const oauthError = searchParams.get('oauth_error');
  const { status, user, setSignedIn, refresh } = useAuth();
  const { providers, loading: providersLoading } = useAuthProviders();
  const googleProvider = googleSignInProviderId(providers);
  const facebookProvider = facebookSignInProviderId(providers);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · Jade Court';
  }, []);

  useEffect(() => {
    if (status === 'ready' && user) {
      navigate(nextPath, { replace: true });
    }
  }, [status, user, navigate, nextPath]);

  useEffect(() => {
    if (status === 'ready' && user && oauthError) {
      void refresh();
    }
  }, [status, user, oauthError, refresh]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const signedIn = await playerLogin(trimmedEmail, password);
      setSignedIn(signedIn);
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container-sm py-10">
      <div className="news-panel mx-auto max-w-md border border-line-soft p-8 shadow-md">
        <h1 className="m-0 mb-2 text-center font-display text-2xl font-extrabold">Sign in</h1>
        <p className="mb-6 text-center text-sm font-semibold text-muted">
          Save progress and pick up your games on any device.
        </p>
        {oauthError ? (
          <p className="mb-4 text-sm font-bold text-red-deep" role="alert">
            {oauthErrorMessage(oauthError)}
          </p>
        ) : null}
        {!providersLoading && (googleProvider || facebookProvider) ? (
          <OAuthSignInButtons
            googleProvider={googleProvider}
            facebookProvider={facebookProvider}
            returnTo={nextPath}
            dividerLabel="or sign in with email"
          />
        ) : null}
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <label
            htmlFor="login-email"
            className="flex flex-col gap-2 text-sm font-bold text-ink-soft"
          >
            Email
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              className="room-link-input w-full text-left font-body"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label
            htmlFor="login-password"
            className="flex flex-col gap-2 text-sm font-bold text-ink-soft"
          >
            Password
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="room-link-input w-full text-left font-body"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <p className="m-0 text-right text-sm font-semibold">
            <Link
              to="/forgot-password"
              className="text-jade-deep font-bold no-underline hover:underline"
            >
              Forgot password?
            </Link>
          </p>
          {error ? (
            <p className="text-sm font-bold text-red-deep" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm font-semibold text-muted">
          No account yet?{' '}
          <Link to="/register" className="text-jade-deep font-bold no-underline hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
