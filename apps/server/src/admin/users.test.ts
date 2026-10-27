import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_DUMMY_PASSWORD_FOR_TIMING,
  isAdminEnabled,
  parseAdminUsers,
  verifyAdminCredentials,
} from './users.js';

describe('parseAdminUsers', () => {
  it('parses multiple users and trims whitespace', () => {
    const map = parseAdminUsers(' alice: pass1 , bob:pass2 ');
    expect(map.size).toBe(2);
    expect(map.get('alice')).toBe('pass1');
    expect(map.get('bob')).toBe('pass2');
  });

  it('allows colons in passwords (split on first colon only)', () => {
    const map = parseAdminUsers('u:pa:ss:word');
    expect(map.get('u')).toBe('pa:ss:word');
  });

  it('skips malformed entries', () => {
    const map = parseAdminUsers('nocolon, :empty, empty:, good:ok, ,');
    expect(map.size).toBe(1);
    expect(map.get('good')).toBe('ok');
  });

  it('later duplicate username overwrites earlier', () => {
    const map = parseAdminUsers('a:one,a:two');
    expect(map.get('a')).toBe('two');
  });

  it('returns empty map for blank input', () => {
    expect(parseAdminUsers('').size).toBe(0);
    expect(parseAdminUsers('   ').size).toBe(0);
  });
});

describe('verifyAdminCredentials', () => {
  beforeEach(() => {
    process.env.ADMIN_USERS = 'alice:secret,bob:other';
  });

  afterEach(() => {
    delete process.env.ADMIN_USERS;
  });

  it('accepts valid credentials', () => {
    expect(verifyAdminCredentials('alice', 'secret')).toBe(true);
    expect(verifyAdminCredentials('bob', 'other')).toBe(true);
  });

  it('rejects wrong password for known user', () => {
    expect(verifyAdminCredentials('alice', 'wrong')).toBe(false);
  });

  it('rejects unknown user', () => {
    expect(verifyAdminCredentials('nobody', 'secret')).toBe(false);
  });

  it('rejects unknown user even when password equals the internal dummy', () => {
    expect(verifyAdminCredentials('nobody', ADMIN_DUMMY_PASSWORD_FOR_TIMING)).toBe(false);
  });
});

describe('isAdminEnabled', () => {
  afterEach(() => {
    delete process.env.ADMIN_USERS;
  });

  it('is false with no valid users', () => {
    expect(isAdminEnabled()).toBe(false);
    process.env.ADMIN_USERS = 'nocolon, :empty';
    expect(isAdminEnabled()).toBe(false);
  });

  it('is true when at least one user is set', () => {
    process.env.ADMIN_USERS = 'a:b';
    expect(isAdminEnabled()).toBe(true);
  });
});
