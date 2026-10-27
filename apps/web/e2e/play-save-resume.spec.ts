import { expect, test } from '@playwright/test';
import { playMove, square } from './helpers';

const uniqueEmail = () => `e2e-save-${Date.now()}@jade-court.test`;

test.describe('Play vs Computer save/resume', () => {
  test('autosaves, reloads, and continues the same position', async ({ page }) => {
    const email = uniqueEmail();
    const password = 'e2e-password-12';

    await page.goto('/login?mode=register');
    await page.getByLabel(/Display name/).fill('E2E Save');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/register\/sent$/);

    await page.goto('/play');
    await page.getByRole('button', { name: /Beginner/ }).click();
    await page.getByRole('button', { name: 'Start game →' }).click();
    await expect(page.getByText('Your move')).toBeVisible();

    await playMove(page, [7, 1], [7, 4]);
    await expect(page.getByText('Moves played: 2')).toBeVisible();
    await playMove(page, [9, 1], [7, 2]);
    await expect(page.getByText('Moves played: 4')).toBeVisible();

    await page.getByRole('button', { name: 'New game' }).click();
    await expect(page.getByTestId('continue-saved-game')).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByTestId('continue-saved-game')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Moves played: 4')).toBeVisible();
    await expect(square(page, 7, 4)).toHaveAttribute('data-piece', 'rC');
    await expect(square(page, 7, 2)).toHaveAttribute('data-piece', 'rH');
  });
});
