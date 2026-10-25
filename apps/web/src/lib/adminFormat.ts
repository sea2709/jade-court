/**
 * Shared formatting helpers for admin tables (dates, money).
 */

export function formatAdminDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatAdminAmount(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const value = amount / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export function formatPaymentStatus(status: string): string {
  if (status === 'refunded') return 'Refunded';
  if (status === 'paid') return 'Paid';
  return status;
}
