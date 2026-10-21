/**
 * Session cookie helpers (httpOnly, SameSite=Lax, Secure in production).
 */
import { getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { isProduction, SESSION_COOKIE_NAME, sessionTtlMs } from './config.js';

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE_NAME);
}

export function setSessionCookie(c: Context, token: string, expiresAt: Date): void {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'Lax',
    path: '/',
    maxAge,
  });
}

export function clearSessionCookie(c: Context): void {
  setCookie(c, SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
  });
}

/** Compute expiry from configured TTL (register/login). */
export function newSessionExpiresAt(): Date {
  return new Date(Date.now() + sessionTtlMs());
}
