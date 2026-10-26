/**
 * Short-lived signed cookie for OAuth state, PKCE verifier, and return path.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { isProduction } from '../config.js';
import { sessionSecret } from '../config.js';

export const OAUTH_COOKIE_NAME = 'jade_oauth';

const COOKIE_TTL_MS = 10 * 60_000;

export type OAuthFlowMode = 'signin' | 'link';

export type OAuthCookiePayload = {
  state: string;
  verifier: string;
  returnTo: string;
  mode: OAuthFlowMode;
  linkUserId?: string;
  expiresAt: number;
};

function signingKey(): string {
  const secret = sessionSecret();
  if (secret.length > 0) return secret;
  if (process.env.NODE_ENV === 'test') return 'test-oauth-cookie-secret-0123456789ab';
  return '';
}

function signPayload(encodedPayload: string): string {
  const key = signingKey();
  return createHmac('sha256', key).update(encodedPayload, 'utf8').digest('base64url');
}

function encodePayload(payload: OAuthCookiePayload): string {
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json, 'utf8').toString('base64url');
  const sig = signPayload(encoded);
  return `${encoded}.${sig}`;
}

function decodePayload(value: string): OAuthCookiePayload | null {
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const encoded = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = signPayload(encoded);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as OAuthCookiePayload;
    if (
      typeof parsed.state !== 'string' ||
      typeof parsed.verifier !== 'string' ||
      typeof parsed.returnTo !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      (parsed.mode !== 'signin' && parsed.mode !== 'link')
    ) {
      return null;
    }
    if (parsed.linkUserId !== undefined && typeof parsed.linkUserId !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function newOAuthState(): string {
  return randomBytes(16).toString('base64url');
}

export function setOAuthCookie(c: Context, payload: Omit<OAuthCookiePayload, 'expiresAt'>): void {
  const expiresAt = Date.now() + COOKIE_TTL_MS;
  const value = encodePayload({ ...payload, expiresAt });
  setCookie(c, OAUTH_COOKIE_NAME, value, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(COOKIE_TTL_MS / 1000),
  });
}

export function readOAuthCookie(c: Context): OAuthCookiePayload | null {
  const raw = getCookie(c, OAUTH_COOKIE_NAME);
  if (!raw) return null;
  const payload = decodePayload(raw);
  if (!payload || payload.expiresAt <= Date.now()) return null;
  return payload;
}

export function clearOAuthCookie(c: Context): void {
  setCookie(c, OAUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
  });
}
