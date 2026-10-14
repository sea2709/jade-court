import { expect, test } from '@playwright/test';
import { json } from './helpers';

const sampleItem = {
  id: 'e2e-1',
  sourceUrl: 'https://example.com/e2e-story',
  title: 'E2E championship headline',
  summary: 'Playwright stubbed summary for the curated news card on the public feed.',
  publisher: 'E2E Weekly',
  sourceDomain: 'example.com',
  imageUrl: 'https://example.com/thumb.jpg',
  sortAt: '2026-10-14T12:00:00.000Z',
  tags: ['tournament'],
};

test.describe('news page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/news**', (route) =>
      json(route, { items: [sampleItem], nextCursor: null }),
    );
  });

  test('nav link opens news and renders cards', async ({ page }) => {
    await page.goto('/');
    await page.locator('nav.nav').getByRole('link', { name: 'News' }).click();
    await expect(page).toHaveURL(/\/news$/);
    await expect(page.getByRole('heading', { name: 'Xiangqi news' })).toBeVisible();
    await expect(
      page.getByRole('link', {
        name: 'E2E championship headline — E2E Weekly (opens in new tab)',
      }),
    ).toBeVisible();
  });

  test('card opens publisher site in a new tab', async ({ page, context }) => {
    await page.goto('/news');
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page
        .getByRole('link', {
          name: 'E2E championship headline — E2E Weekly (opens in new tab)',
        })
        .click(),
    ]);
    await expect(popup).toHaveURL(sampleItem.sourceUrl);
  });

  test('load more stories appends results', async ({ page }) => {
    let call = 0;
    await page.route('**/api/news**', (route) => {
      call += 1;
      if (call === 1) {
        return json(route, { items: [sampleItem], nextCursor: 'c2' });
      }
      return json(route, {
        items: [{ ...sampleItem, id: 'e2e-2', title: 'Second story headline' }],
        nextCursor: null,
      });
    });
    await page.goto('/news');
    await page.getByRole('button', { name: 'Load more stories' }).click();
    await expect(page.getByRole('link', { name: /Second story headline/ })).toBeVisible();
    await expect(page.getByText("You're all caught up.")).toBeVisible();
  });

  test('empty state when no items', async ({ page }) => {
    await page.route('**/api/news**', (route) => json(route, { items: [], nextCursor: null }));
    await page.goto('/news');
    await expect(
      page.getByRole('heading', { name: 'No news yet — check back soon' }),
    ).toBeVisible();
  });
});
