import { expect, test } from '@playwright/test';
import { json } from './helpers';

const verifiedUser = {
  id: 'e2e-user',
  email: 'e2e@jade-court.test',
  emailVerified: true,
  displayName: 'E2E',
  accessUntil: null,
  preferredModelId: null,
};

test.describe('Account billing', () => {
  test('shows day pass card and payment history', async ({ page }) => {
    const accessUntil = new Date(Date.now() + 17 * 60 * 60 * 1000 + 42 * 60 * 1000).toISOString();
    const grantedFrom = new Date(Date.parse(accessUntil) - 24 * 60 * 60 * 1000).toISOString();
    await page.route('**/api/me', (route) =>
      json(route, {
        user: { ...verifiedUser, accessUntil },
        access: { active: true, accessUntil },
      }),
    );
    await page.route('**/api/billing/payments', (route) =>
      json(route, {
        payments: [
          {
            id: 'pay-1',
            stripeSessionId: 'cs_test',
            amount: 100,
            currency: 'usd',
            status: 'paid',
            createdAt: '2026-01-01T12:00:00.000Z',
            grantedFrom,
            grantedUntil: accessUntil,
            receiptUrl: 'https://pay.stripe.com/receipt/e2e',
          },
        ],
      }),
    );
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: /Day pass · Active/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Payment history/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Receipt' })).toHaveAttribute(
      'href',
      'https://pay.stripe.com/receipt/e2e',
    );
  });
});

test.describe('Play with AI paywall', () => {
  test('shows Buy day pass for signed-in user without access', async ({ page }) => {
    await page.route('**/api/me', (route) =>
      json(route, {
        user: verifiedUser,
        access: { active: false, accessUntil: null },
      }),
    );
    await page.route('**/api/ai/models', (route) =>
      json(route, {
        models: [{ id: 'stub', label: 'Stub Model' }],
        defaultId: 'stub',
      }),
    );
    await page.goto('/play-ai');
    await expect(page.getByRole('button', { name: /Buy day pass · \$1/i })).toBeVisible();
    await expect(page.getByText('Stub Model')).toBeVisible();
  });
});
