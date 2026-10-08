import { expect, test, type Browser, type Page } from '@playwright/test';
import { playMove, square } from './helpers';

/** Host creates a room; guest joins with the code in a separate browser context (own guest id). */
async function openRoom(browser: Browser): Promise<{ host: Page; guest: Page; code: string }> {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();

  await host.goto('/multiplayer');
  await host.getByRole('button', { name: /Create a room/ }).click();
  await expect(host.getByRole('heading', { name: 'Invite your friend' })).toBeVisible();
  const code = (await host.locator('.room-link-input').inputValue()).split('room=')[1]!;
  expect(code).toMatch(/^JADE-/);

  await guest.goto('/multiplayer');
  await guest.getByRole('button', { name: /Join with a code/ }).click();
  await guest.getByPlaceholder('JADE-XXXX').fill(code);
  await guest.getByRole('button', { name: 'Join game →' }).click();
  await expect(guest.getByText('You are playing as Black 將.')).toBeVisible();

  await expect(host.getByText('✓ Opponent joined the room!')).toBeVisible();
  await host.getByRole('button', { name: 'Start game →' }).click();
  await expect(host.getByText('You are playing as Red 帥.')).toBeVisible();
  await expect(host.getByText('Opponent connected ✓')).toBeVisible();

  return { host, guest, code };
}

test.describe('Play with Friends (online room)', () => {
  test('a move by Red appears on Black’s board', async ({ browser }) => {
    const { host, guest } = await openRoom(browser);

    await expect(host.getByText('Your move')).toBeVisible();
    await expect(guest.getByText('Red 帥 to move')).toBeVisible();

    await playMove(host, [7, 1], [7, 4]);
    await expect(square(guest, 7, 4)).toHaveAttribute('data-piece', 'rC');
    await expect(guest.getByText('Your move')).toBeVisible();
    await expect(host.getByText('Black 將 to move')).toBeVisible();

    await playMove(guest, [0, 1], [2, 2]);
    await expect(square(host, 2, 2)).toHaveAttribute('data-piece', 'bH');
    await expect(host.getByText('Your move')).toBeVisible();
  });

  test('a legal move does not surface a rejection error', async ({ browser }) => {
    // Known bug: useRoomGame sends the WebSocket move inside a setState updater, which React
    // StrictMode (dev) runs twice; the duplicate is rejected with "Not your turn".
    // Remove `test.fail` once the send moves out of the updater.
    test.fail();
    const { host } = await openRoom(browser);
    await playMove(host, [7, 1], [7, 4]);
    await expect(host.getByText('Black 將 to move')).toBeVisible();
    await expect(host.getByText('Not your turn')).toHaveCount(0, { timeout: 2000 });
  });

  test('Black cannot move out of turn', async ({ browser }) => {
    const { guest } = await openRoom(browser);
    await square(guest, 0, 1).click({ force: true });
    await expect(square(guest, 0, 1)).not.toHaveClass(/selected/);
    await expect(guest.locator('.hit')).toHaveCount(0);
  });

  test('Black sees Red at the top of a flipped board', async ({ browser }) => {
    const { guest } = await openRoom(browser);
    const red = await square(guest, 9, 4).boundingBox();
    const black = await square(guest, 0, 4).boundingBox();
    expect(red!.y).toBeLessThan(black!.y);
  });

  test('joining an unknown room shows an error', async ({ page }) => {
    await page.goto('/multiplayer?room=JADE-ZZZZ');
    await page.getByRole('button', { name: 'Join game →' }).click();
    await expect(page.getByText('Room not found')).toBeVisible();
  });
});
