import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { playMove, square } from './helpers';

export type MultiplayerRoom = {
  host: Page;
  guest: Page;
  code: string;
  close: () => Promise<void>;
};

/** Close pages/contexts so WebSockets shut down before Playwright tears down the browser. */
export async function closeMultiplayerRoom(host: Page, guest: Page): Promise<void> {
  const pages = [host, guest];
  for (const page of pages) {
    await page.goto('about:blank').catch(() => {});
  }
  for (const page of pages) {
    await page.close().catch(() => {});
  }
  const contexts = new Set<BrowserContext>(pages.map((p) => p.context()));
  for (const ctx of contexts) {
    await ctx.close().catch(() => {});
  }
}

/** Host creates a room; guest joins with the code in a separate browser context (own guest id). */
async function openRoom(browser: Browser): Promise<MultiplayerRoom> {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

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

  return {
    host,
    guest,
    code,
    close: () => closeMultiplayerRoom(host, guest),
  };
}

test.describe('Play with Friends (online room)', () => {
  test('a move by Red appears on Black’s board', async ({ browser }) => {
    const room = await openRoom(browser);
    try {
      const { host, guest } = room;

      await expect(host.getByText('Your move')).toBeVisible();
      await expect(guest.getByText('Red 帥 to move')).toBeVisible();

      await playMove(host, [7, 1], [7, 4]);
      await expect(square(guest, 7, 4)).toHaveAttribute('data-piece', 'rC');
      await expect(guest.getByText('Your move')).toBeVisible();
      await expect(host.getByText('Black 將 to move')).toBeVisible();

      await playMove(guest, [0, 1], [2, 2]);
      await expect(square(host, 2, 2)).toHaveAttribute('data-piece', 'bH');
      await expect(host.getByText('Your move')).toBeVisible();
    } finally {
      await room.close();
    }
  });

  test('a legal move does not surface a rejection error', async ({ browser }) => {
    // Known bug: useRoomGame sends the WebSocket move inside a setState updater, which React
    // StrictMode (dev) runs twice; the duplicate is rejected with "Not your turn".
    // Remove `test.fail` once the send moves out of the updater.
    test.fail();
    const room = await openRoom(browser);
    try {
      const { host } = room;
      await playMove(host, [7, 1], [7, 4]);
      await expect(host.getByText('Black 將 to move')).toBeVisible();
      await expect(host.getByText('Not your turn')).toHaveCount(0, { timeout: 2000 });
    } finally {
      await room.close();
    }
  });

  test('Black cannot move out of turn', async ({ browser }) => {
    const room = await openRoom(browser);
    try {
      const { guest } = room;
      await square(guest, 0, 1).click({ force: true });
      await expect(square(guest, 0, 1)).not.toHaveClass(/selected/);
      await expect(guest.locator('.hit')).toHaveCount(0);
    } finally {
      await room.close();
    }
  });

  test('Black sees Red at the top of a flipped board', async ({ browser }) => {
    const room = await openRoom(browser);
    try {
      const { guest } = room;
      const red = await square(guest, 9, 4).boundingBox();
      const black = await square(guest, 0, 4).boundingBox();
      expect(red!.y).toBeLessThan(black!.y);
    } finally {
      await room.close();
    }
  });

  test('joining an unknown room shows an error', async ({ page }) => {
    await page.goto('/multiplayer?room=JADE-ZZZZ');
    await page.getByRole('button', { name: 'Join game →' }).click();
    await expect(page.getByText('Room not found')).toBeVisible();
  });

  // --- Issue #40: resign when playing with friends -----------------------

  test('either player can resign; both sides see the resolved game-over overlay', async ({
    browser,
  }) => {
    const room = await openRoom(browser);
    try {
      const { host, guest } = room;

      // Host (Red) opens the confirmation overlay.
      await host.getByTestId('resign-button').click();
      await expect(host.getByTestId('resign-confirm')).toBeVisible();
      await expect(host.getByRole('heading', { name: 'Resign this game?' })).toBeVisible();
      await expect(host.getByText(/cannot be undone/)).toBeVisible();

      // Confirms — both players should see the game-over overlay.
      await host.getByTestId('resign-confirm').getByRole('button', { name: 'Resign' }).click();

      // Resigner: lost the game as a result of their concession.
      await expect(host.getByTestId('online-game-over')).toBeVisible();
      await expect(host.getByRole('heading', { name: 'You lose' })).toBeVisible();
      await expect(host.getByText('You resigned.')).toBeVisible();

      // Opponent: won because Red conceded.
      await expect(guest.getByTestId('online-game-over')).toBeVisible();
      await expect(guest.getByRole('heading', { name: 'You win!' })).toBeVisible();
      await expect(guest.getByText('Red resigned — Black wins.')).toBeVisible();

      // Resign button disappears for both players; the board is no longer
      // interactive for either side.
      await expect(host.getByTestId('resign-button')).toHaveCount(0);
      await expect(guest.getByTestId('resign-button')).toHaveCount(0);
    } finally {
      await room.close();
    }
  });

  test('canceling the resign confirmation keeps the game in progress', async ({ browser }) => {
    const room = await openRoom(browser);
    try {
      const { host, guest } = room;

      await host.getByTestId('resign-button').click();
      await expect(host.getByTestId('resign-confirm')).toBeVisible();

      // Cancel: overlay should disappear; the game still says "Your move".
      await host.getByRole('button', { name: 'Cancel' }).click();
      await expect(host.getByTestId('resign-confirm')).toHaveCount(0);
      await expect(host.getByTestId('online-game-over')).toHaveCount(0);
      await expect(host.getByText('Your move')).toBeVisible();
      await expect(guest.getByText('Red 帥 to move')).toBeVisible();

      // And a legal move still works on this side.
      await playMove(host, [7, 1], [7, 4]);
      await expect(square(guest, 7, 4)).toHaveAttribute('data-piece', 'rC');
    } finally {
      await room.close();
    }
  });

  test('reloading after a resignation keeps the game-over overlay', async ({ browser }) => {
    const room = await openRoom(browser);
    try {
      const { host, guest } = room;

      // Black resigns so the opponent-side snippet reads "Black resigned — Red wins."
      await guest.getByTestId('resign-button').click();
      await guest.getByTestId('resign-confirm').getByRole('button', { name: 'Resign' }).click();

      await expect(host.getByTestId('online-game-over')).toBeVisible();
      await expect(host.getByText('Black resigned — Red wins.')).toBeVisible();
      const offlineUrl = host.url();

      // Reload the host page. The WebSocket subscription drops, the Lobby
      // briefly owns the page, and the user re-joins with their existing
      // guest id. The server returns the resigned snapshot, the hook mirrors
      // `status: 'resigned'` + `winner: 'r'` into state, and the game-over
      // overlay re-appears.
      await host.reload();
      await host.getByRole('button', { name: 'Join game →' }).click();
      await host.waitForURL(offlineUrl);
      await expect(host.getByText('You are playing as Red 帥.')).toBeVisible();
      await expect(host.getByTestId('online-game-over')).toBeVisible();
      await expect(host.getByRole('heading', { name: 'You win!' })).toBeVisible();
      await expect(host.getByText('Black resigned — Red wins.')).toBeVisible();
    } finally {
      await room.close();
    }
  });
});
