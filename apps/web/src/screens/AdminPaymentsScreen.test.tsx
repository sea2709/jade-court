import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAdminSession } from '../lib/adminApi';
import { AdminPaymentsScreen } from './AdminPaymentsScreen';

const onUnauthorizedMock = vi.fn();

vi.mock('../admin/AdminSessionContext', () => ({
  useAdminSession: () => ({
    username: 'test-admin',
    onUnauthorized: onUnauthorizedMock,
  }),
}));

const fetchMock = vi.fn<typeof fetch>();

const futureExpiry = () => new Date(Date.now() + 60_000).toISOString();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  setAdminSession({ token: 'tok', username: 'test-admin', expiresAt: futureExpiry() });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('AdminPaymentsScreen', () => {
  it('links user email and id to admin user detail', async () => {
    fetchMock.mockResolvedValue(
      json({
        payments: [
          {
            id: 'pay-1',
            stripeSessionId: 'cs_1',
            amount: 499,
            currency: 'usd',
            status: 'paid',
            createdAt: '2026-01-01T12:00:00.000Z',
            grantedFrom: '2026-01-01T12:00:00.000Z',
            grantedUntil: '2026-01-02T12:00:00.000Z',
            userId: 'user-abc',
            userEmail: 'payer@example.com',
          },
        ],
        nextCursor: null,
      }),
    );

    render(
      <MemoryRouter initialEntries={['/admin/payments']}>
        <Routes>
          <Route path="/admin/payments" element={<AdminPaymentsScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    const links = await screen.findAllByRole('link', { name: /payer@example.com/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute('href', '/admin/users?userId=user-abc&q=payer%40example.com');
    expect(screen.getByRole('link', { name: 'user-abc' })).toHaveAttribute(
      'href',
      '/admin/users?userId=user-abc&q=payer%40example.com',
    );
  });
});
