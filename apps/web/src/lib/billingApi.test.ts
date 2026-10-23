import { describe, expect, it } from 'vitest';
import { isAllowedCheckoutUrl } from './billingApi';

describe('isAllowedCheckoutUrl', () => {
  it('allows Stripe checkout hosts', () => {
    expect(isAllowedCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_abc')).toBe(true);
  });

  it('allows same-origin relative paths', () => {
    expect(isAllowedCheckoutUrl('/account')).toBe(true);
  });

  it('rejects javascript and unknown hosts', () => {
    expect(isAllowedCheckoutUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedCheckoutUrl('https://evil.example/phish')).toBe(false);
  });
});
