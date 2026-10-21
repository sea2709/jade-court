import { expect, test } from '@playwright/test';

const uniqueEmail = () => `e2e-player-${Date.now()}@jade-court.test`;

test.describe('player auth', () => {
  test('register, avatar menu, sign out with notice', async ({ page }) => {
    const email = uniqueEmail();
    const password = 'e2e-password-12';

    await page.goto('/register');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByLabel(/Display name/).fill('E2E Player');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/play$/);
    const avatar = page.getByRole('button', { name: /Account menu/i });
    await expect(avatar).toBeVisible();

    await avatar.click();
    const menu = page.getByRole('menu', { name: 'Account' });
    await expect(menu).toBeVisible();
    await expect(menu.getByText('E2E Player', { exact: true })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/play-ai$/);
    await expect(page.getByRole('status')).toContainText(
      "You're signed out. Your unfinished games are saved to your account.",
    );
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });
});
