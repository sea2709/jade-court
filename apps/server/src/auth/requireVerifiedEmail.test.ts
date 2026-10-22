import { describe, expect, it } from 'vitest';
import { requireVerifiedEmail } from './requireVerifiedEmail.js';

describe('requireVerifiedEmail', () => {
  it('allows verified users', () => {
    expect(requireVerifiedEmail({ emailVerified: true })).toEqual({ ok: true });
  });

  it('blocks unverified users', () => {
    expect(requireVerifiedEmail({ emailVerified: false })).toEqual({
      ok: false,
      error: 'email_not_verified',
    });
  });
});
