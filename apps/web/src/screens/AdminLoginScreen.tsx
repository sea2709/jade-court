/**
 * Public admin login at `/admin/login`.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AdminApiError, adminLogin, getAdminSession, resolveAdminNextParam } from '../lib/adminApi';

const ROBOTS_META_ID = 'admin-login-robots';

function loginErrorMessage(err: unknown): string {
  if (!(err instanceof AdminApiError)) {
    return 'Something went wrong. Try again.';
  }
  switch (err.code) {
    case 'invalid_credentials':
      return 'Invalid username or password.';
    case 'rate_limited':
      return 'Too many attempts. Try again in a few minutes.';
    case 'admin_disabled':
      return 'Admin is disabled on this server.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/** Username/password login for the admin panel. */
export function AdminLoginScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = resolveAdminNextParam(searchParams.get('next'));

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Admin sign in · Jade Court';
    let meta = document.getElementById(ROBOTS_META_ID) as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      meta.id = ROBOTS_META_ID;
      document.head.appendChild(meta);
    }
    meta.content = 'noindex';
    return () => {
      meta?.remove();
    };
  }, []);

  useEffect(() => {
    if (getAdminSession()) {
      navigate(nextPath, { replace: true });
    }
  }, [navigate, nextPath]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const user = username.trim();
    const pass = password;
    if (!user || !pass) {
      setError('Enter your username and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await adminLogin(user, pass);
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream text-ink">
      <div className="mx-auto max-w-[1180px] px-[30px] py-10">
        <div className="news-panel mx-auto max-w-md border border-line-soft p-8 shadow-md">
          <h1 className="m-0 mb-2 text-center font-display text-2xl font-extrabold">
            Admin sign in
          </h1>
          <p className="mb-6 text-center text-sm font-semibold text-muted">
            Jade Court administration
          </p>
          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
            <label
              htmlFor="admin-username"
              className="flex flex-col gap-2 text-sm font-bold text-ink-soft"
            >
              Username
              <input
                id="admin-username"
                name="username"
                type="text"
                autoComplete="username"
                className="room-link-input w-full text-left font-body"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label
              htmlFor="admin-password"
              className="flex flex-col gap-2 text-sm font-bold text-ink-soft"
            >
              Password
              <input
                id="admin-password"
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
        </div>
      </div>
    </div>
  );
}
