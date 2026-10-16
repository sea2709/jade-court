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

async function fillDisplayName(page: Page, name: string) {
  await page.getByLabel('Your name').fill(name);
}

/** Host creates a room; guest joins with the code in a separate browser context (own guest id). */
async function openRoom(
  browser: Browser,
  options?: { hostName?: string; guestName?: string },
): Promise<MultiplayerRoom> {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/multiplayer');
  if (options?.hostName) await fillDisplayName(host, options.hostName);
  await host.getByRole('button', { name: /Create a room/ }).click();
  await expect(host.getByTestId('waiting-invite-panel')).toBeVisible();
  const code = (await host.locator('.room-link-input').inputValue()).split('room=')[1]!;
  expect(code).toMatch(/^JADE-/);

  await guest.goto('/multiplayer');
  if (options?.guestName) await fillDisplayName(guest, options.guestName);
  await guest.getByRole('button', { name: /Join with a code/ }).click();
  await guest.getByPlaceholder('JADE-XXXX').fill(code);
  await guest.getByRole('button', { name: 'Join game →' }).click();
  const guestYouLabel = options?.guestName ? `${options.guestName} (you)` : 'Black player (you)';
  await expect(guest.getByText(guestYouLabel)).toBeVisible();

  await expect(host.getByTestId('waiting-invite-panel')).toHaveCount(0);
  const hostYouLabel = options?.hostName ? `${options.hostName} (you)` : 'Red player (you)';
  await expect(host.getByText(hostYouLabel)).toBeVisible();
  if (options?.guestName) {
    await expect(host.locator('.card').getByText(options.guestName, { exact: true })).toBeVisible();
    await expect(host.getByText('connected')).toBeVisible();
  }

  return {
    host,
    guest,
    code,
    close: () => closeMultiplayerRoom(host, guest),
  };
}

test.describe('Play with Friends (online room)', () => {
  test('host can copy invite link while waiting for opponent', async ({ browser }) => {
    const hostContext = await browser.newContext();
    await hostContext.grantPermissions(['clipboard-read', 'clipboard-write']);
    const host = await hostContext.newPage();
    await host.goto('/multiplayer');
    await host.getByRole('button', { name: /Create a room/ }).click();
    await expect(host.getByTestId('waiting-invite-panel')).toBeVisible();
    await host.getByRole('button', { name: 'Copy link' }).click();
    await expect(host.getByRole('button', { name: '✓ Copied' })).toBeVisible();
    await host.close();
    await hostContext.close();
  });

  test('Red cannot move before Black joins', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const host = await hostContext.newPage();
    try {
      await host.goto('/multiplayer');
      await host.getByRole('button', { name: /Create a room/ }).click();
      await expect(host.getByText('Waiting for opponent to join…')).toBeVisible();
      await expect(host.getByText('Your move')).toHaveCount(0);
      await square(host, 7, 1).click({ force: true });
      await expect(square(host, 7, 1)).not.toHaveClass(/selected/);
      await expect(host.locator('.hit')).toHaveCount(0);
    } finally {
      await host.close();
      await hostContext.close();
    }
  });

  test('host reload while waiting returns to the board, not the join form', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const host = await hostContext.newPage();
    try {
      await host.goto('/multiplayer');
      await host.getByRole('button', { name: /Create a room/ }).click();
      await expect(host.getByTestId('waiting-invite-panel')).toBeVisible();
      await host.reload();
      await expect(host.getByText('Red player (you)')).toBeVisible();
      await expect(host.getByTestId('waiting-invite-panel')).toBeVisible();
      await expect(host.getByRole('heading', { name: 'Join a room' })).toHaveCount(0);
    } finally {
      await host.close();
      await hostContext.close();
    }
  });

  test('two named players see each other in the room card', async ({ browser }) => {
    const room = await openRoom(browser, { hostName: 'Minh', guestName: 'Lan' });
    try {
      const { host, guest } = room;
      await expect(host.getByText('Minh (you)')).toBeVisible();
      await expect(host.locator('.card').getByText('Lan', { exact: true })).toBeVisible();
      await expect(guest.getByText('Lan (you)')).toBeVisible();
      await expect(guest.locator('.card').getByText('Minh', { exact: true })).toBeVisible();
      await expect(host.getByTestId('waiting-invite-panel')).toHaveCount(0);
    } finally {
      await room.close();
    }
  });

  test('uses fallback labels when a player skips entering a name', async ({ browser }) => {
    const room = await openRoom(browser, { hostName: 'Minh' });
    try {
      const { host, guest } = room;
      await expect(host.getByText('Minh (you)')).toBeVisible();
      await expect(host.getByText('Black player')).toBeVisible();
      await expect(guest.getByText('Black player (you)')).toBeVisible();
      await expect(guest.locator('.card').getByText('Minh', { exact: true })).toBeVisible();
    } finally {
      await room.close();
    }
  });

  test('a move by Red appears on Black’s board', async ({ browser }) => {
    const room = await openRoom(browser);
    try {
      const { host, guest } = room;

      await expect(host.getByText('Your move')).toBeVisible();
      await expect(guest.getByText('Red player to move')).toBeVisible();

      await playMove(host, [7, 1], [7, 4]);
      await expect(square(guest, 7, 4)).toHaveAttribute('data-piece', 'rC');
      await expect(guest.getByText('Your move')).toBeVisible();
      await expect(host.getByText('Black player to move')).toBeVisible();

      await playMove(guest, [0, 1], [2, 2]);
      await expect(square(host, 2, 2)).toHaveAttribute('data-piece', 'bH');
      await expect(host.getByText('Your move')).toBeVisible();
    } finally {
      await room.close();
    }
  });

  test('a legal move does not surface a rejection error', async ({ browser }) => {
    test.fail();
    const room = await openRoom(browser);
    try {
      const { host } = room;
      await playMove(host, [7, 1], [7, 4]);
      await expect(host.getByText('Black player to move')).toBeVisible();
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

  test('either player can resign; both sides see the resolved game-over overlay', async ({
    browser,
  }) => {
    const room = await openRoom(browser, { hostName: 'Minh', guestName: 'Lan' });
    try {
      const { host, guest } = room;

      await host.getByTestId('resign-button').click();
      await expect(host.getByTestId('resign-confirm')).toBeVisible();
      await expect(host.getByRole('heading', { name: 'Resign this game?' })).toBeVisible();
      await expect(host.getByText(/cannot be undone/)).toBeVisible();

      await host.getByTestId('resign-confirm').getByRole('button', { name: 'Resign' }).click();

      await expect(host.getByTestId('online-game-over')).toBeVisible();
      await expect(host.getByRole('heading', { name: 'You lose' })).toBeVisible();
      await expect(host.getByText('You resigned.')).toBeVisible();

      await expect(guest.getByTestId('online-game-over')).toBeVisible();
      await expect(guest.getByRole('heading', { name: 'You win!' })).toBeVisible();
      await expect(guest.getByText('Minh resigned.')).toBeVisible();

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

      await host.getByRole('button', { name: 'Cancel' }).click();
      await expect(host.getByTestId('resign-confirm')).toHaveCount(0);
      await expect(host.getByTestId('online-game-over')).toHaveCount(0);
      await expect(host.getByText('Your move')).toBeVisible();
      await expect(guest.getByText('Red player to move')).toBeVisible();

      await playMove(host, [7, 1], [7, 4]);
      await expect(square(guest, 7, 4)).toHaveAttribute('data-piece', 'rC');
    } finally {
      await room.close();
    }
  });

  test('reloading after a resignation keeps the game-over overlay', async ({ browser }) => {
    const room = await openRoom(browser, { guestName: 'Lan' });
    try {
      const { host, guest } = room;

      await guest.getByTestId('resign-button').click();
      await guest.getByTestId('resign-confirm').getByRole('button', { name: 'Resign' }).click();

      await expect(host.getByTestId('online-game-over')).toBeVisible();
      await expect(host.getByText('Lan resigned.')).toBeVisible();
      const offlineUrl = host.url();

      await host.reload();
      await host.waitForURL(offlineUrl);
      await expect(host.getByText(/\(you\)/)).toBeVisible();
      await expect(host.getByTestId('online-game-over')).toBeVisible();
      await expect(host.getByRole('heading', { name: 'You win!' })).toBeVisible();
      await expect(host.getByText('Lan resigned.')).toBeVisible();
    } finally {
      await room.close();
    }
  });
});
