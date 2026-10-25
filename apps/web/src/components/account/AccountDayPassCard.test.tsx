import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDayPassCard } from './AccountDayPassCard';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const payments = [
  {
    id: 'p1',
    stripeSessionId: 'cs_1',
    amount: 100,
    currency: 'usd',
    status: 'paid' as const,
    createdAt: '2026-01-01T10:00:00.000Z',
    grantedFrom: '2026-01-01T12:00:00.000Z',
    grantedUntil: '2026-01-02T12:00:00.000Z',
  },
];

describe('AccountDayPassCard', () => {
  it('shows active pass with countdown and extend CTA', () => {
    const until = '2026-01-02T05:42:00.000Z';
    render(
      <MemoryRouter>
        <AccountDayPassCard
          accessUntil={until}
          emailVerified
          hasEmail
          payments={[
            {
              ...payments[0],
              grantedFrom: '2026-01-01T05:42:00.000Z',
              grantedUntil: until,
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Day pass · Active/i })).toBeInTheDocument();
    expect(screen.getByText(/17h 42m left/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add 24 hours · \$1/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Play with AI/i })).toHaveAttribute('href', '/play-ai');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows inactive state with Buy day pass', () => {
    render(
      <MemoryRouter>
        <AccountDayPassCard accessUntil={null} emailVerified hasEmail payments={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No active day pass/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buy day pass · \$1/i })).toBeInTheDocument();
  });
});
