import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, verifySessionToken } from './session.js';

const SECRET = 'test-session-secret-0123456789abcdef0123456789ab';

describe('admin session tokens', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    process.env.ADMIN_USERS = 'alice:pass';
    process.env.ADMIN_SESSION_SECRET = SECRET;
    delete process.env.ADMIN_SESSION_TTL_HOURS;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ADMIN_USERS;
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.ADMIN_SESSION_TTL_HOURS;
  });

  it('round-trips a valid token', () => {
    const { token, expiresAt } = createSessionToken('alice');
    expect(expiresAt).toBe('2026-01-15T20:00:00.000Z');
    expect(verifySessionToken(token)).toEqual({ status: 'valid', username: 'alice' });
  });

  it('rejects tampered payload', () => {
    const { token } = createSessionToken('alice');
    const [payload] = token.split('.');
    const tampered = `${payload}x.${token.split('.')[1]}`;
    expect(verifySessionToken(tampered)).toEqual({ status: 'invalid_auth' });
  });

  it('rejects tampered signature', () => {
    const { token } = createSessionToken('alice');
    const [payload, sig] = token.split('.');
    const badSig = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    expect(verifySessionToken(`${payload}.${badSig}`)).toEqual({ status: 'invalid_auth' });
  });

  it('rejects malformed tokens', () => {
    expect(verifySessionToken('not-a-jwt')).toEqual({ status: 'invalid_auth' });
    expect(verifySessionToken('..')).toEqual({ status: 'invalid_auth' });
  });

  it('rejects expired tokens without invalid_auth', () => {
    const { token } = createSessionToken('alice');
    vi.setSystemTime(new Date('2026-01-16T00:00:00.000Z'));
    expect(verifySessionToken(token)).toEqual({ status: 'unauthorized' });
  });

  it('rejects revoked user (removed from ADMIN_USERS)', () => {
    const { token } = createSessionToken('alice');
    process.env.ADMIN_USERS = 'bob:pass';
    expect(verifySessionToken(token)).toEqual({ status: 'unauthorized' });
  });

  it('rejects token signed with wrong secret', () => {
    const { token } = createSessionToken('alice');
    process.env.ADMIN_SESSION_SECRET = 'other-secret-0123456789abcdef0123456789ab';
    expect(verifySessionToken(token)).toEqual({ status: 'invalid_auth' });
  });

  it('uses default TTL 8h and falls back on invalid ADMIN_SESSION_TTL_HOURS', () => {
    const { expiresAt } = createSessionToken('alice');
    expect(expiresAt).toBe('2026-01-15T20:00:00.000Z');

    process.env.ADMIN_SESSION_TTL_HOURS = 'not-a-number';
    const short = createSessionToken('alice');
    expect(short.expiresAt).toBe('2026-01-15T20:00:00.000Z');

    process.env.ADMIN_SESSION_TTL_HOURS = '2';
    const two = createSessionToken('alice');
    expect(two.expiresAt).toBe('2026-01-15T14:00:00.000Z');
  });
});
