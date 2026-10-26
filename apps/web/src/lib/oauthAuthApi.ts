/**
 * OAuth provider list, sign-in start URLs, and account identity link/unlink.
 */
import { PlayerAuthApiError } from './playerAuthApi';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const jsonCredentials: RequestCredentials = 'include';

async function parseJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function errorCode(data: Record<string, unknown>, status: number): string {
  if (typeof data.error === 'string') return data.error;
  if (status === 401) return 'unauthorized';
  return 'request_failed';
}

function throwOAuthError(status: number, data: Record<string, unknown>): never {
  throw new PlayerAuthApiError(status, errorCode(data, status));
}

/** Configured OAuth provider ids from the server (e.g. `google`, `fake` in test). */
export async function fetchAuthProviders(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/auth/providers`, {
    credentials: jsonCredentials,
    headers: { Accept: 'application/json' },
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    if (res.status === 503 && data.error === 'auth_disabled') return [];
    throwOAuthError(res.status, data);
  }
  const providers = data.providers;
  if (!Array.isArray(providers)) return [];
  return providers.filter((p): p is string => typeof p === 'string');
}

export interface AuthIdentitiesResponse {
  hasPassword: boolean;
  providers: string[];
}

/** Linked OAuth providers and whether a password is set (session required). */
export async function fetchAuthIdentities(): Promise<AuthIdentitiesResponse> {
  const res = await fetch(`${API_BASE}/api/auth/identities`, {
    credentials: jsonCredentials,
    headers: { Accept: 'application/json' },
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwOAuthError(res.status, data);
  }
  const providersRaw = data.providers;
  const providers = Array.isArray(providersRaw)
    ? providersRaw.filter((p): p is string => typeof p === 'string')
    : [];
  return {
    hasPassword: data.hasPassword === true,
    providers,
  };
}

/** Root-relative URL to start OAuth sign-in (full page navigation). */
export function oauthSignInStartUrl(provider: string, returnTo: string): string {
  const path = returnTo.startsWith('/') ? returnTo : '/';
  const q = new URLSearchParams({ returnTo: path });
  return `${API_BASE}/api/auth/${encodeURIComponent(provider)}/start?${q.toString()}`;
}

/**
 * Provider id used for the public “Continue with Google” button.
 * Production uses `google`; E2E/test uses `fake` when Google is not configured.
 */
export function googleSignInProviderId(configured: string[]): string | null {
  if (configured.includes('google')) return 'google';
  if (configured.includes('fake')) return 'fake';
  return null;
}

/** Account settings OAuth provider (Google in prod, fake in test). */
export function googleAccountProviderId(configured: string[]): string | null {
  return googleSignInProviderId(configured);
}

/** Start account link flow (redirects to IdP). */
export async function linkOAuthProvider(provider: string, returnTo: string): Promise<void> {
  const path = returnTo.startsWith('/') ? returnTo : '/';
  const q = new URLSearchParams({ returnTo: path });
  const res = await fetch(
    `${API_BASE}/api/auth/identities/${encodeURIComponent(provider)}/link?${q.toString()}`,
    {
      method: 'POST',
      credentials: jsonCredentials,
      redirect: 'manual',
    },
  );
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('Location');
    if (loc) {
      window.location.assign(loc);
      return;
    }
  }
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwOAuthError(res.status, data);
  }
  throw new PlayerAuthApiError(500, 'request_failed', 'OAuth link did not redirect.');
}

/** Remove a linked OAuth provider from the signed-in account. */
export async function unlinkOAuthProvider(provider: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/identities/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
    credentials: jsonCredentials,
    headers: { Accept: 'application/json' },
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwOAuthError(res.status, data);
  }
}

export function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case 'oauth_state_missing':
    case 'state_mismatch':
      return 'Sign-in was interrupted. Try again.';
    case 'missing_code':
    case 'exchange_failed':
      return 'Could not finish sign-in with Google. Try again.';
    case 'identity_taken':
      return 'That Google account is already linked to another user.';
    case 'email_taken':
      return 'That email is already registered with a different sign-in method.';
    case 'link_failed':
      return 'Could not link Google to your account. Try again.';
    default:
      return 'Something went wrong with Google sign-in. Try again.';
  }
}
