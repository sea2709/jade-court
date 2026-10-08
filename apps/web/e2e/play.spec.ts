import { expect, test } from '@playwright/test';
import { playMove, square } from './helpers';

test.describe('Play vs Computer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/play');
    await page.getByRole('button', { name: /Beginner/ }).click();
  });

  test('plays a move and receives the computer reply from the server', async ({ page }) => {
    const opponentResponse = page.waitForResponse('**/api/opponent/move');
    await page.getByRole('button', { name: 'Start game →' }).click();
    await expect(page.getByText('Your move')).toBeVisible();

    await playMove(page, [7, 1], [7, 4]);
    await expect(square(page, 7, 4)).toHaveAttribute('data-piece', 'rC');

    const res = await opponentResponse;
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ source: 'negamax' });

    await expect(page.getByText('Moves played: 2')).toBeVisible();
    await expect(page.getByText('Your move')).toBeVisible();
    await expect(page.locator('.piece.computer-lastmove')).toHaveCount(1);
    await expect(page.getByText("Computer's last move")).toBeVisible();
  });

  test('take back undoes both plies', async ({ page }) => {
    await page.getByRole('button', { name: 'Start game →' }).click();
    await playMove(page, [7, 1], [7, 4]);
    await expect(page.getByText('Moves played: 2')).toBeVisible();

    await page.getByRole('button', { name: '↶ Take back move' }).click();
    await expect(page.getByText('Moves played: 0')).toBeVisible();
    await expect(square(page, 7, 1)).toHaveAttribute('data-piece', 'rC');
  });

  test('an illegal destination is ignored', async ({ page }) => {
    await page.getByRole('button', { name: 'Start game →' }).click();
    await square(page, 9, 0).click();
    await expect(square(page, 9, 0)).toHaveClass(/selected/);
    // The Black chariot on the same file is blocked by Red's own pieces, so it is not a target.
    await square(page, 0, 0).click();
    await expect(square(page, 9, 0)).not.toHaveClass(/selected/);
    await expect(square(page, 9, 0)).toHaveAttribute('data-piece', 'rR');
    await expect(square(page, 0, 0)).toHaveAttribute('data-piece', 'bR');
    await expect(page.getByText('Moves played: 0')).toBeVisible();
  });

  test('the computer opens when the human plays Black', async ({ page }) => {
    await page.getByRole('button', { name: 'Black 將' }).click();
    await page.getByRole('button', { name: 'Start game →' }).click();
    await expect(page.getByText('Moves played: 1')).toBeVisible();
    await expect(page.getByText('Your move')).toBeVisible();

    const red = await square(page, 9, 4).boundingBox();
    const black = await square(page, 0, 4).boundingBox();
    expect(red!.y).toBeLessThan(black!.y);
  });
});
