/**
 * Stripe day-pass payment history on the account page.
 */
import type { PublicPayment } from '../../lib/billingApi';

function formatPaymentDate(createdAt: string): string {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return createdAt;
  return new Date(t).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAmount(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const value = amount / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export interface PaymentHistoryTableProps {
  payments: PublicPayment[];
}

/** Table of past day-pass charges; omit the section when `payments` is empty. */
export function PaymentHistoryTable({ payments }: PaymentHistoryTableProps) {
  if (!payments.length) return null;

  return (
    <section
      className="news-panel border border-line-soft p-8 shadow-md max-w-3xl mt-8"
      aria-labelledby="payment-history-heading"
    >
      <h2
        id="payment-history-heading"
        className="m-0 mb-4 font-display text-xl font-extrabold text-ink"
      >
        Payment history
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-semibold text-left border-collapse">
          <thead>
            <tr className="border-b border-line-soft text-muted">
              <th className="py-2 pr-4 font-bold">Date</th>
              <th className="py-2 pr-4 font-bold">Item</th>
              <th className="py-2 pr-4 font-bold">Amount</th>
              <th className="py-2 pr-4 font-bold">Status</th>
              <th className="py-2 font-bold">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-line-soft last:border-b-0">
                <td className="py-3 pr-4 text-ink">{formatPaymentDate(p.createdAt)}</td>
                <td className="py-3 pr-4 text-ink">Day pass · 24 hours</td>
                <td className="py-3 pr-4 text-ink">{formatAmount(p.amount, p.currency)}</td>
                <td className="py-3 pr-4 text-ink">
                  {p.status === 'refunded' ? 'Refunded' : 'Paid'}
                </td>
                <td className="py-3 text-ink">
                  {p.receiptUrl ? (
                    <a
                      href={p.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-jade-deep font-bold underline underline-offset-2"
                    >
                      Receipt
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-4 text-xs font-semibold text-muted">
        Charges show as JADE COURT on your statement.
      </p>
    </section>
  );
}
