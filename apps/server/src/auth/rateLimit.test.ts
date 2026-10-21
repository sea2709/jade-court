import { afterEach, describe, expect, it } from 'vitest';
import {
  beginLoginPasswordCheck,
  playerLoginEmailKey,
  playerLoginPeerEmailKey,
  reserveLoginFailureAttempts,
  resetPlayerAuthRateLimitsForTests,
  setLoginFailedVolumeMaxForTests,
} from './rateLimit.js';

describe('reserveLoginFailureAttempts', () => {
  afterEach(() => {
    resetPlayerAuthRateLimitsForTests();
  });

  it('allows at most 10 concurrent reservations per key', () => {
    const key = playerLoginEmailKey('a@b.com');
    let ok = 0;
    let limited = 0;
    for (let i = 0; i < 20; i++) {
      const result = reserveLoginFailureAttempts([key]);
      if (result === 'ok') ok += 1;
      else limited += 1;
    }
    expect(ok).toBe(10);
    expect(limited).toBe(10);
  });

  it('does not share failure lockout between emails on the same peer', () => {
    const ip = '203.0.113.1';
    const victimKey = playerLoginPeerEmailKey(ip, 'victim@example.com');
    const otherKey = playerLoginPeerEmailKey(ip, 'other@example.com');

    for (let i = 0; i < 10; i++) {
      expect(reserveLoginFailureAttempts([victimKey])).toBe('ok');
    }
    expect(reserveLoginFailureAttempts([victimKey])).toBe('limited');
    expect(reserveLoginFailureAttempts([otherKey])).toBe('ok');
  });
});

describe('beginLoginPasswordCheck', () => {
  afterEach(() => {
    resetPlayerAuthRateLimitsForTests();
  });

  it('at cap allows another check without reserving (success path)', () => {
    setLoginFailedVolumeMaxForTests(2);
    for (let i = 0; i < 2; i++) {
      const guard = beginLoginPasswordCheck();
      expect(guard).not.toBe('limited');
      expect(guard).toEqual({ kind: 'below_cap', rollback: expect.any(Function) });
    }
    expect(beginLoginPasswordCheck()).toEqual({ kind: 'at_cap' });
  });
});
