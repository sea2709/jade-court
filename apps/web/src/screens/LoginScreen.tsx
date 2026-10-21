/**
 * Player sign-in at `/login`.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { PlayerAuthApiError, playerLogin } from '../lib/playerAuthApi';

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

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/play';
  if (raw === '/login' || raw.startsWith('/login?')) return '/play';
  if (raw === '/register' || raw.startsWith('/register?')) return '/play';
  return raw;
}

/** Email/password login for player accounts. */
export function LoginScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));
  const { status, user, setSignedIn } = useAuth();

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
