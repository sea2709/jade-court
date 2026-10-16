import { expect, test, type Browser, type Page } from '@playwright/test';
import { closeMultiplayerRoom } from './helpers';

async function fillDisplayName(page: Page, name: string) {
  await page.getByLabel('Your name').fill(name);
}

async function openNamedRoom(browser: Browser, hostName: string, guestName: string) {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/multiplayer');
  await fillDisplayName(host, hostName);
  await host.getByRole('button', { name: /Create a room/ }).click();
  await expect(host.getByTestId('waiting-invite-panel')).toBeVisible();
  const code = (await host.locator('.room-link-input').inputValue()).split('room=')[1]!;

  await guest.goto('/multiplayer');
  await fillDisplayName(guest, guestName);
  await guest.getByRole('button', { name: /Join with a code/ }).click();
  await guest.getByPlaceholder('JADE-XXXX').fill(code);
  await guest.getByRole('button', { name: 'Join game →' }).click();
  await expect(guest.getByText(`${guestName} (you)`)).toBeVisible();
  await expect(host.getByText(`${hostName} (you)`)).toBeVisible();

  return {
    host,
    guest,
    code,
    close: () => closeMultiplayerRoom(host, guest),
  };
}

async function sendChat(page: Page, text: string) {
  const input = page.getByTestId('room-chat-input');
  await input.fill(text);
  await input.press('Enter');
}

test.describe('In-room chat', () => {
  test('two players exchange messages under their names', async ({ browser }) => {
    const room = await openNamedRoom(browser, 'Alice', 'Bob');
    try {
      const { host, guest } = room;
      await sendChat(host, 'Good luck!');
      await expect(guest.getByTestId('room-chat-message-list')).toContainText('Good luck!');
      await expect(
        guest.getByTestId('room-chat-message-list').getByText('Alice', { exact: true }),
      ).toBeVisible();

      await sendChat(guest, 'You too');
      await expect(host.getByTestId('room-chat-message-list')).toContainText('You too');
      await expect(
        host.getByTestId('room-chat-message-list').getByText('Bob', { exact: true }),
      ).toBeVisible();
    } finally {
      await room.close();
    }
  });

  test('reload restores chat history', async ({ browser }) => {
    const room = await openNamedRoom(browser, 'Alice', 'Bob');
    try {
      const { host, guest } = room;
      await sendChat(host, 'See you after refresh');
      await expect(guest.getByText('See you after refresh')).toBeVisible();

      await guest.reload();
      await expect(guest.getByText('See you after refresh')).toBeVisible();
      await expect(guest.getByTestId('room-chat-system-line')).toContainText('Bob joined the room');
    } finally {
      await room.close();
    }
  });

  test('rate limits the sixth rapid message', async ({ browser }) => {
    const room = await openNamedRoom(browser, 'Alice', 'Bob');
    try {
      const { host, guest } = room;
      for (let i = 1; i <= 5; i++) {
        await sendChat(host, `msg ${i}`);
      }
      await expect(guest.getByText('msg 5')).toBeVisible();

      await sendChat(host, 'msg 6');
      await expect(host.getByText(/sending messages too fast/i)).toBeVisible();
      await expect(guest.getByText('msg 6')).toHaveCount(0);
      await expect(host.getByTestId('room-chat-input')).toHaveValue('msg 6');
    } finally {
      await room.close();
    }
  });

  test('resign adds a system line for both players', async ({ browser }) => {
    const room = await openNamedRoom(browser, 'Alice', 'Bob');
    try {
      const { host, guest } = room;
      await host.getByTestId('resign-button').click();
      await host.getByTestId('resign-confirm').getByRole('button', { name: 'Resign' }).click();

      const line = 'Alice resigned — Bob wins';
      await expect(host.getByText(line)).toBeVisible();
      await expect(guest.getByText(line)).toBeVisible();
    } finally {
      await room.close();
    }
  });

  test('desktop collapse shows unread when a message arrives', async ({ browser }) => {
    const room = await openNamedRoom(browser, 'Alice', 'Bob');
    try {
      const { host, guest } = room;
      await host.getByTestId('room-chat-collapse').click();
      await expect(host.getByTestId('room-chat-collapsed')).toBeVisible();

      await sendChat(guest, 'While collapsed');
      await expect(host.getByTestId('room-chat-unread')).toBeVisible();
      await host.getByTestId('room-chat-collapsed').click();
      await expect(host.getByTestId('room-chat-unread')).toHaveCount(0);
      await expect(host.getByText('While collapsed')).toBeVisible();
    } finally {
      await room.close();
    }
  });

  test('mobile drawer and unread badge', async ({ browser }) => {
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const desktopContext = await browser.newContext();
    const host = await desktopContext.newPage();
    const guest = await mobileContext.newPage();

    try {
      await host.goto('/multiplayer');
      await fillDisplayName(host, 'Alice');
      await host.getByRole('button', { name: /Create a room/ }).click();
      const code = (await host.locator('.room-link-input').inputValue()).split('room=')[1]!;

      await guest.goto('/multiplayer');
      await fillDisplayName(guest, 'Bob');
      await guest.getByRole('button', { name: /Join with a code/ }).click();
      await guest.getByPlaceholder('JADE-XXXX').fill(code);
      await guest.getByRole('button', { name: 'Join game →' }).click();
      await expect(guest.getByText('Bob (you)')).toBeVisible();

      await expect(guest.getByTestId('room-chat-mobile-bar')).toBeVisible();
      await guest.getByTestId('room-chat-mobile-bar').click();
      await expect(guest.getByTestId('room-chat-sheet')).toBeVisible();
      await guest.getByLabel('Close chat').first().click();
      await expect(guest.getByTestId('room-chat-sheet')).toHaveCount(0);

      await sendChat(host, 'Mobile ping');
      await expect(guest.getByTestId('room-chat-unread')).toBeVisible();
    } finally {
      await closeMultiplayerRoom(host, guest);
      await mobileContext.close();
      await desktopContext.close();
    }
  });
});
