import { describe, expect, it } from 'vitest';
import { authLoginSearch, authModeFromSearch } from './authScreenMode';

describe('authScreenMode', () => {
  it('reads register mode from query', () => {
    expect(authModeFromSearch('mode=register')).toBe('register');
    expect(authModeFromSearch('next=%2Fplay&mode=register')).toBe('register');
    expect(authModeFromSearch('')).toBe('signin');
    expect(authModeFromSearch('mode=signin')).toBe('signin');
  });

  it('builds login search when switching mode', () => {
    const base = new URLSearchParams('next=%2Fplay&oauth_error=email_taken');
    expect(authLoginSearch(base, 'register')).toBe(
      '?next=%2Fplay&oauth_error=email_taken&mode=register',
    );
    const register = new URLSearchParams('mode=register&next=%2Fplay');
    expect(authLoginSearch(register, 'signin')).toBe('?next=%2Fplay');
  });
});
