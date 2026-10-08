import { expect, test } from '@playwright/test';

test.describe('home and navigation', () => {
  test('renders the landing page with a preview board', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Master Xiangqi');
    await expect(page.locator('[data-testid="board"] [data-piece]')).toHaveCount(32);
  });

  test('top navigation routes to each screen', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav.nav');

    await nav.getByRole('link', { name: 'Play vs Computer' }).click();
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByRole('heading', { name: 'Play vs Computer' })).toBeVisible();

    await nav.getByRole('link', { name: 'Friends' }).click();
    await expect(page).toHaveURL(/\/multiplayer$/);
    await expect(page.getByRole('heading', { name: 'Play with a Friend' })).toBeVisible();

    await nav.getByRole('link', { name: 'Learn with AI' }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(page.getByText('Learn mode')).toBeVisible();

    await page.getByRole('button', { name: /Jade Court/ }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('home call-to-action buttons open Learn and Play', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start learning →' }).click();
    await expect(page).toHaveURL(/\/learn$/);

    await page.goto('/');
    await page.getByRole('button', { name: 'Play vs computer', exact: true }).click();
    await expect(page).toHaveURL(/\/play$/);
  });
});
