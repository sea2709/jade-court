import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PaymentHistoryTable } from './PaymentHistoryTable';

const paidRow = {
  id: 'p1',
  stripeSessionId: 'cs_1',
  amount: 100,
  currency: 'usd',
  status: 'paid' as const,
  createdAt: '2026-01-15T12:00:00.000Z',
  grantedFrom: '2026-01-15T12:00:00.000Z',
  grantedUntil: '2026-01-16T12:00:00.000Z',
  receiptUrl: 'https://pay.stripe.com/receipt/abc',
};

describe('PaymentHistoryTable', () => {
  it('renders nothing when payments are empty', () => {
    const { container } = render(<PaymentHistoryTable payments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders paid row with receipt link opening in new tab', () => {
    render(<PaymentHistoryTable payments={[paidRow]} />);
    expect(screen.getByRole('heading', { name: /Payment history/i })).toBeInTheDocument();
    expect(screen.getByText('Day pass · 24 hours')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    const receipt = screen.getByRole('link', { name: 'Receipt' });
    expect(receipt).toHaveAttribute('href', paidRow.receiptUrl);
    expect(receipt).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/JADE COURT on your statement/i)).toBeInTheDocument();
  });

  it('shows Refunded status', () => {
    render(
      <PaymentHistoryTable
        payments={[{ ...paidRow, id: 'p2', status: 'refunded', receiptUrl: undefined }]}
      />,
    );
    expect(screen.getByText('Refunded')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Receipt' })).not.toBeInTheDocument();
  });
});
