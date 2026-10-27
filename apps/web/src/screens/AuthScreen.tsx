/**
 * Combined player sign-in and registration at `/login` (`?mode=register` for create account).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { OAuthSignInButtons } from '../components/auth/OAuthSignInButtons';
import { useAuthProviders } from '../hooks/useAuthProviders';
import { useAuth } from '../context/useAuth';
import { authLoginSearch, authModeFromSearch } from '../lib/authScreenMode';
import {
  facebookSignInProviderId,
  googleSignInProviderId,
  oauthErrorMessage,
} from '../lib/oauthAuthApi';
import { PlayerAuthApiError, playerLogin, playerRegister } from '../lib/playerAuthApi';
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

function registerErrorMessage(err: unknown): string {
  if (!(err instanceof PlayerAuthApiError)) {
    return 'Something went wrong. Try again.';
  }
  switch (err.code) {
    case 'email_taken':
      return 'That email is already registered.';
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

/** Email/password sign-in and account creation with OAuth on one screen. */
export function AuthScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = authModeFromSearch(searchParams.toString());
  const isRegister = mode === 'register';
  const nextPath = safeLoginNextPath(searchParams.get('next'));
  const oauthError = searchParams.get('oauth_error');
  const { status, user, setSignedIn, refresh } = useAuth();
  const { providers, loading: providersLoading } = useAuthProviders();
  const googleProvider = googleSignInProviderId(providers);
  const facebookProvider = facebookSignInProviderId(providers);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = isRegister ? 'Create account · Jade Court' : 'Sign in · Jade Court';
  }, [isRegister]);

  useEffect(() => {
    if (status === 'ready' && user) {
      if (isRegister) {
        navigate(user.emailVerified ? '/play' : '/register/sent', { replace: true });
      } else {
        navigate(nextPath, { replace: true });
      }
    }
  }, [status, user, navigate, nextPath, isRegister]);

  useEffect(() => {
    if (status === 'ready' && user && oauthError) {
      void refresh();
    }
  }, [status, user, oauthError, refresh]);

  const switchMode = (target: 'signin' | 'register') => {
    setError(null);
    setEmailTaken(false);
    if (target === 'signin') {
      setPassword('');
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (target === 'register') {
          next.set('mode', 'register');
        } else {
          next.delete('mode');
        }
        return next;
      },
      { replace: true },
    );
  };

  const onSubmitSignIn = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setEmailTaken(false);
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

  const onSubmitRegister = async (e: FormEvent) => {
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
    setEmailTaken(false);
    try {
      const signedIn = await playerRegister(trimmedEmail, password, trimmedDisplayName);
      setSignedIn(signedIn);
      navigate('/register/sent', { replace: true });
    } catch (err) {
      if (err instanceof PlayerAuthApiError && err.code === 'email_taken') {
        setEmailTaken(true);
      }
      setError(registerErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const registerSwitchSearch = authLoginSearch(searchParams, 'register');
  const signInSwitchSearch = authLoginSearch(searchParams, 'signin');

  return (
    <div className="page-container-sm pt-[22px] pb-11">
      <div className="auth-card">
        <h1 className="auth-heading">{isRegister ? 'Create account' : 'Sign in'}</h1>
        <p className="auth-subtitle">
          {isRegister
            ? 'Free to join — your games sync when you sign in.'
            : 'Save progress and pick up your games on any device.'}
        </p>
        {oauthError ? (
          <p className="auth-alert" role="alert">
            {oauthErrorMessage(oauthError)}
          </p>
        ) : null}
        {!providersLoading && (googleProvider || facebookProvider) ? (
          <OAuthSignInButtons
            googleProvider={googleProvider}
            facebookProvider={facebookProvider}
            returnTo={nextPath}
            dividerLabel="or with email"
          />
        ) : null}
        {isRegister ? (
          <form onSubmit={(e) => void onSubmitRegister(e)} className="auth-form">
            <p className="m-0 text-xs font-bold text-muted">
              <RequiredMark /> Required field
            </p>
            <label htmlFor="auth-display-name" className="auth-label">
              <span>
                Display name <RequiredMark />
              </span>
              <input
                id="auth-display-name"
                name="displayName"
                type="text"
                autoComplete="nickname"
                required
                maxLength={64}
                className="auth-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label htmlFor="auth-email-register" className="auth-label">
              <span>
                Email <RequiredMark />
              </span>
              <input
                id="auth-email-register"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label htmlFor="auth-password-register" className="auth-label">
              <span>
                Password <RequiredMark />
              </span>
              <input
                id="auth-password-register"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error ? (
              <p className="auth-alert" role="alert">
                {error}
                {emailTaken ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="bg-transparent p-0 font-extrabold text-red-deep underline"
                      onClick={() => switchMode('signin')}
                    >
                      Sign in instead
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
            <p className="auth-note">We&apos;ll email you a link to verify your address.</p>
          </form>
        ) : (
          <form onSubmit={(e) => void onSubmitSignIn(e)} className="auth-form">
            <label htmlFor="auth-email-signin" className="auth-label">
              Email
              <input
                id="auth-email-signin"
                name="email"
                type="email"
                autoComplete="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label htmlFor="auth-password-signin" className="auth-label">
              Password
              <input
                id="auth-password-signin"
                name="password"
                type="password"
                autoComplete="current-password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <p className="m-0 -mt-1 text-right">
              <Link to="/forgot-password" className="auth-link">
                Forgot password?
              </Link>
            </p>
            {error ? (
              <p className="auth-alert" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
        <p className="m-0 text-center text-[13.5px] font-bold text-muted">
          {isRegister ? (
            <>
              Already have an account?{' '}
              <Link
                to={`/login${signInSwitchSearch}`}
                className="auth-link"
                onClick={() => {
                  setError(null);
                  setEmailTaken(false);
                  setPassword('');
                }}
              >
                Sign in
              </Link>
            </>
          ) : (
            <>
              No account yet?{' '}
              <Link
                to={`/login${registerSwitchSearch}`}
                className="auth-link"
                onClick={() => {
                  setError(null);
                  setEmailTaken(false);
                }}
              >
                Create one
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
