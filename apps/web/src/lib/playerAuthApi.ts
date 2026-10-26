/**
 * Player account API: register, login, logout, and `/me` via session cookie.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '';

/** Public user fields returned by auth and `/api/me`. */
export interface PublicUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  accessUntil: string | null;
  preferredModelId: string | null;
}

export interface MeAccess {
  active: boolean;
  accessUntil: string | null;
}

export interface MeResponse {
  user: PublicUser | null;
  access: MeAccess;
}

export class PlayerAuthApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'PlayerAuthApiError';
    this.status = status;
    this.code = code;
  }
}

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
  if (status === 401) return 'invalid_credentials';
  if (status === 429) return 'rate_limited';
  return 'request_failed';
}

function throwPlayerError(status: number, data: Record<string, unknown>): never {
  throw new PlayerAuthApiError(status, errorCode(data, status));
}

function isPublicUser(data: unknown): data is PublicUser {
  if (typeof data !== 'object' || data === null) return false;
  const o = data as Record<string, unknown>;
  return typeof o.id === 'string';
}

function parseMeResponse(data: Record<string, unknown>): MeResponse {
  const userRaw = data.user;
  const user = userRaw === null ? null : isPublicUser(userRaw) ? userRaw : null;
  const accessRaw = data.access;
  let access: MeAccess = { active: false, accessUntil: null };
  if (typeof accessRaw === 'object' && accessRaw !== null) {
    const a = accessRaw as Record<string, unknown>;
    access = {
      active: a.active === true,
      accessUntil: typeof a.accessUntil === 'string' ? a.accessUntil : null,
    };
  }
  return { user, access };
}

const jsonCredentials: RequestCredentials = 'include';

/** Current session user and access flags. */
export async function fetchPlayerMe(): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/api/me`, {
    credentials: jsonCredentials,
    headers: { Accept: 'application/json' },
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwPlayerError(res.status, data);
  }
  return parseMeResponse(data);
}

/** Create account and establish session cookie. Display name is required (trimmed). */
export async function playerRegister(
  email: string,
  password: string,
  displayName: string,
): Promise<PublicUser> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    credentials: jsonCredentials,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password, displayName: displayName.trim() }),
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwPlayerError(res.status, data);
  }
  const user = data.user;
  if (!isPublicUser(user)) {
    throw new PlayerAuthApiError(500, 'request_failed', 'Invalid register response.');
  }
  return user;
}

/** Sign in with email/password. */
export async function playerLogin(email: string, password: string): Promise<PublicUser> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    credentials: jsonCredentials,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwPlayerError(res.status, data);
  }
  const user = data.user;
  if (!isPublicUser(user)) {
    throw new PlayerAuthApiError(500, 'request_failed', 'Invalid login response.');
  }
  return user;
}

/** Confirm email from verification link token; may set session cookie. */
export async function playerVerifyEmail(token: string): Promise<PublicUser> {
  const res = await fetch(`${API_BASE}/api/auth/verify`, {
    method: 'POST',
    credentials: jsonCredentials,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwPlayerError(res.status, data);
  }
  const user = data.user;
  if (!isPublicUser(user)) {
    throw new PlayerAuthApiError(500, 'request_failed', 'Invalid verify response.');
  }
  return user;
}

/** Attach an email to the signed-in account (OAuth users without email). Sends verification. */
export async function playerAddAccountEmail(email: string): Promise<PublicUser> {
  const res = await fetch(`${API_BASE}/api/auth/add-email`, {
    method: 'POST',
    credentials: jsonCredentials,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: email.trim() }),
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwPlayerError(res.status, data);
  }
  const user = data.user;
  if (!isPublicUser(user)) {
    throw new PlayerAuthApiError(500, 'request_failed', 'Invalid add-email response.');
  }
  return user;
}

/** Resend verification email for the signed-in user. */
export async function playerResendVerification(): Promise<{ ok: true }> {
  const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
    method: 'POST',
    credentials: jsonCredentials,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwPlayerError(res.status, data);
  }
  if (data.ok !== true) {
    throw new PlayerAuthApiError(500, 'request_failed', 'Invalid resend response.');
  }
  return { ok: true };
}

export interface ForgotPasswordResponse {
  ok: true;
  message: string;
}

/** Request a password reset email (always succeeds with check_your_email when accepted). */
export async function playerForgotPassword(email: string): Promise<ForgotPasswordResponse> {
  const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
    method: 'POST',
    credentials: jsonCredentials,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwPlayerError(res.status, data);
  }
  if (data.ok !== true) {
    throw new PlayerAuthApiError(500, 'request_failed', 'Invalid forgot-password response.');
  }
  return {
    ok: true,
    message: typeof data.message === 'string' ? data.message : 'check_your_email',
  };
}

/** Set a new password from reset link token; establishes a new session cookie. */
export async function playerResetPassword(token: string, password: string): Promise<PublicUser> {
  const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
    method: 'POST',
    credentials: jsonCredentials,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwPlayerError(res.status, data);
  }
  const user = data.user;
  if (!isPublicUser(user)) {
    throw new PlayerAuthApiError(500, 'request_failed', 'Invalid reset-password response.');
  }
  return user;
}

/** End session and clear cookie server-side. */
export async function playerLogout(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    credentials: jsonCredentials,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
  });
  const data = await parseJsonBody(res);
  if (!res.ok) {
    throwPlayerError(res.status, data);
  }
}
