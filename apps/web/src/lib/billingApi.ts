/**
 * Day-pass checkout (`POST /api/billing/checkout`).
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export class BillingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'BillingApiError';
  }
}

export interface CheckoutResponse {
  url: string;
}

export type PaymentStatus = 'paid' | 'refunded';

/** Row from `GET /api/billing/payments` (newest first). */
export interface PublicPayment {
  id: string;
  stripeSessionId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  grantedFrom: string;
  grantedUntil: string;
  receiptUrl?: string;
}

export interface PaymentsResponse {
  payments: PublicPayment[];
}

const ALLOWED_CHECKOUT_HOSTS = new Set(['checkout.stripe.com', 'billing.stripe.com']);

/** Returns true for same-origin relative paths or allowlisted Stripe checkout hosts. */
export function isAllowedCheckoutUrl(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) {
    return true;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    return ALLOWED_CHECKOUT_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/** Navigates to checkout only when the URL passes `isAllowedCheckoutUrl`. */
export function assignCheckoutUrl(url: string): void {
  if (!isAllowedCheckoutUrl(url)) {
    throw new BillingApiError('invalid_checkout_url', 0, 'invalid_checkout_url');
  }
  window.location.assign(url);
}

/** Starts Stripe checkout for a 24-hour day pass; redirects via returned `url`. */
export async function postBillingCheckout(): Promise<CheckoutResponse> {
  const res = await fetch(`${API_BASE}/api/billing/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  });
  const data = (await res.json().catch(() => ({}))) as CheckoutResponse & { error?: string };
  if (!res.ok) {
    throw new BillingApiError(data.error ?? res.statusText, res.status, data.error);
  }
  if (typeof data.url !== 'string' || !data.url) {
    throw new BillingApiError('invalid_response', res.status);
  }
  if (!isAllowedCheckoutUrl(data.url)) {
    throw new BillingApiError('invalid_checkout_url', res.status, 'invalid_checkout_url');
  }
  return { url: data.url };
}

/** Lists the signed-in user's day-pass payments (newest first). */
export async function fetchBillingPayments(): Promise<PaymentsResponse> {
  const res = await fetch(`${API_BASE}/api/billing/payments`, {
    credentials: 'include',
  });
  const data = (await res.json().catch(() => ({}))) as PaymentsResponse & { error?: string };
  if (!res.ok) {
    throw new BillingApiError(data.error ?? res.statusText, res.status, data.error);
  }
  const payments = Array.isArray(data.payments) ? data.payments : [];
  return { payments };
}
