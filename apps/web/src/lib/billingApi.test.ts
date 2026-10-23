import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBillingPayments, isAllowedCheckoutUrl } from './billingApi';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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

describe('fetchBillingPayments', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('returns payments from GET /api/billing/payments', async () => {
    fetchMock.mockResolvedValue(
      json({
        payments: [
          {
            id: 'p1',
            stripeSessionId: 'cs',
            amount: 100,
            currency: 'usd',
            status: 'paid',
            createdAt: '2026-01-01T00:00:00.000Z',
            grantedFrom: '2026-01-01T00:00:00.000Z',
            grantedUntil: '2026-01-02T00:00:00.000Z',
          },
        ],
      }),
    );
    const res = await fetchBillingPayments();
    expect(res.payments).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/billing/payments'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});
