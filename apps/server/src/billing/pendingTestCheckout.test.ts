import { afterEach, describe, expect, it } from 'vitest';
import {
  claimTestCheckoutSession,
  registerTestCheckoutSession,
  resetPendingTestCheckoutForTests,
} from './pendingTestCheckout.js';

describe('pendingTestCheckout', () => {
  afterEach(() => {
    resetPendingTestCheckoutForTests();
  });

  it('claims a registered session for the same user', () => {
    registerTestCheckoutSession('user-1', 'cs_test_abc');
    expect(claimTestCheckoutSession('user-1', 'cs_test_abc')).toBe(true);
    expect(claimTestCheckoutSession('user-1', 'cs_test_abc')).toBe(false);
  });

  it('rejects another user or unknown session', () => {
    registerTestCheckoutSession('user-1', 'cs_test_abc');
    expect(claimTestCheckoutSession('user-2', 'cs_test_abc')).toBe(false);
    expect(claimTestCheckoutSession('user-1', 'cs_missing')).toBe(false);
  });

  it('expires after 15 minutes', () => {
    const now = Date.now();
    registerTestCheckoutSession('user-1', 'cs_old', now - 16 * 60_000);
    expect(claimTestCheckoutSession('user-1', 'cs_old', now)).toBe(false);
  });
});
