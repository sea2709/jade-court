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

    await page.getByRole('button', { name: 'Take back move' }).click();
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

  test.describe('Redo taken-back moves', () => {
    test('Redo is disabled until a take-back, restores the position and counts to 2', async ({
      page,
    }) => {
      // The button should start disabled (no stack yet).
      await page.getByRole('button', { name: 'Start game →' }).click();
      const redo = page.getByRole('button', { name: 'Redo move' });
      await expect(redo).toBeDisabled();
      await expect(redo).toHaveAttribute('title', 'Nothing to redo');

      await playMove(page, [7, 1], [7, 4]);
      await expect(page.getByText('Moves played: 2')).toBeVisible();
      // Still disabled: nothing has been taken back.
      await expect(redo).toBeDisabled();

      await page.getByRole('button', { name: 'Take back move' }).click();
      await expect(page.getByText('Moves played: 0')).toBeVisible();
      // Enabled after a take-back.
      await expect(redo).toBeEnabled();

      // Capture every opponent URL hit during work and assert it didn't grow on redo.
      const opponentUrls: string[] = [];
      page.on('request', (req) => {
        if (req.url().includes('/api/opponent/move')) opponentUrls.push(req.url());
      });

      await redo.click();
      // Board restored, count back to 2, human's turn.
      await expect(page.getByText('Moves played: 2')).toBeVisible();
      await expect(page.getByText('Your move')).toBeVisible();
      await expect(square(page, 7, 4)).toHaveAttribute('data-piece', 'rC');
      // Empty squares have no [data-piece] element in the DOM — assert directly.
      await expect(page.locator('[data-testid="board"] [data-square="7-1"]')).toHaveCount(0);
      await expect(page.locator('.piece.computer-lastmove')).toHaveCount(1);
      await expect(page.getByText("Computer's last move")).toBeVisible();
      // Redo must NOT trigger any opponent API call.
      expect(opponentUrls).toHaveLength(0);
      // Stack consumed.
      await expect(redo).toBeDisabled();
    });

    test('making a new move after a take-back disables Redo', async ({ page }) => {
      await page.getByRole('button', { name: 'Start game →' }).click();
      const redo = page.getByRole('button', { name: 'Redo move' });

      await playMove(page, [7, 1], [7, 4]);
      await page.getByRole('button', { name: 'Take back move' }).click();
      await expect(redo).toBeEnabled();

      // Play a new move — Red central cannon to a different (legal) destination.
      // Start by selecting the right-side cannon and moving it forward.
      // Easiest deterministic second move: Red's lane-7 right cannon [7,7] can
      // advance along col 7 to [4,7] if no piece is in the way.
      // We instead use Red's horse on [9,1] which has a guaranteed legal move.
      await square(page, 9, 1).click();
      await expect(square(page, 9, 1)).toHaveClass(/selected/);
      await square(page, 7, 2).click();
      await expect(page.getByText('Moves played: 2')).toBeVisible();
      // A new move after take-back branches the line: redo must clear.
      await expect(redo).toBeDisabled();
      await expect(redo).toHaveAttribute('title', 'Nothing to redo');
    });

    test('keyboard Ctrl+Shift+Z restores the position without any API call', async ({ page }) => {
      await page.getByRole('button', { name: 'Start game →' }).click();
      await playMove(page, [7, 1], [7, 4]);
      await expect(page.getByText('Moves played: 2')).toBeVisible();

      const opponentUrls: string[] = [];
      page.on('request', (req) => {
        if (req.url().includes('/api/opponent/move')) opponentUrls.push(req.url());
      });

      await page.keyboard.press('Control+Z');
      await expect(page.getByText('Moves played: 0')).toBeVisible();

      // Ctrl+Shift+Z should fire redo.
      await page.keyboard.press('Control+Shift+Z');
      await expect(page.getByText('Moves played: 2')).toBeVisible();
      await expect(square(page, 7, 4)).toHaveAttribute('data-piece', 'rC');
      await expect(opponentUrls).toHaveLength(0);
    });

    test('Ctrl+Z is a no-op (browser default) when there is nothing to undo', async ({ page }) => {
      await page.getByRole('button', { name: 'Start game →' }).click();
      // No moves played yet — Ctrl+Z should NOT preventDefault (we cannot assert
      // browser default behavior, but we at least confirm the board is unchanged).
      await page.keyboard.press('Control+Z');
      await expect(square(page, 7, 1)).toHaveAttribute('data-piece', 'rC');
    });
  });
});
