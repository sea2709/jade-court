import { expect, test } from '@playwright/test';
import { json } from './helpers';

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

    await nav.getByRole('link', { name: 'Play with Friends' }).click();
    await expect(page).toHaveURL(/\/multiplayer$/);
    await expect(page.getByRole('heading', { name: 'Play with a Friend' })).toBeVisible();

    await nav.getByRole('link', { name: 'Learn with AI' }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(page.getByText('Learn mode')).toBeVisible();

    await page.route('**/api/news**', (route) => json(route, { items: [], nextCursor: null }));
    await nav.getByRole('link', { name: 'News' }).click();
    await expect(page).toHaveURL(/\/news$/);
    await expect(page.getByRole('heading', { name: 'Xiangqi news' })).toBeVisible();

    await page.getByRole('button', { name: /Jade Court/ }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('hero demo board is playable and persists across reload', async ({ page }) => {
    await page.goto('/');
    const board = page.locator('[data-testid="home-demo-board"] [data-testid="board"]');
    await expect(page.getByTestId('home-demo-turn')).toHaveText('Red 帥 to move');
    await expect(page.getByTestId('home-demo-restart')).toBeDisabled();

    await board.locator('[data-square="7-1"]').click();
    await expect(board.locator('[data-square="7-1"]')).toHaveClass(/selected/);
    await expect(board.locator('.point').first()).toBeVisible();

    await board.locator('[data-square="7-4"]').click();
    await expect(page.getByTestId('home-demo-turn')).toHaveText('Black 將 to move');
    await expect(page.getByTestId('home-demo-restart')).toBeEnabled();

    await board.locator('[data-square="0-1"]').click();
    await board.locator('[data-square="2-2"]').click();
    await expect(page.getByTestId('home-demo-turn')).toHaveText('Red 帥 to move');

    const saved = await page.evaluate(() => localStorage.getItem('jade-court-home-demo'));
    expect(saved).toContain('"v":1');

    await page.reload();
    await expect(page.getByTestId('home-demo-turn')).toHaveText('Red 帥 to move');
    await expect(board.locator('[data-square="7-4"]')).toContainText('炮');
    await expect(board.locator('[data-square="2-2"]')).toContainText('馬');

    await page.getByTestId('home-demo-restart').click();
    await expect(page.getByTestId('home-demo-restart')).toBeDisabled();
    const cleared = await page.evaluate(() => localStorage.getItem('jade-court-home-demo'));
    expect(cleared).toBeNull();
  });

  test('breadcrumb is hidden on home and navigates back from Play', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);

    await page.locator('nav.nav').getByRole('link', { name: 'Play vs Computer' }).click();
    await expect(page).toHaveURL(/\/play$/);
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(breadcrumb).toContainText('Play vs Computer');
    await breadcrumb.getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
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
