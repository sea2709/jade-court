import { expect, test } from '@playwright/test';
import {
  completeCheckout,
  e2eWebOrigin,
  playMove,
  square,
  stubPlayAiLlmRoutes,
  uniqueTestEmail,
  verifyEmailFromOutbox,
  waitForActiveAiSave,
} from './helpers';

const chat = '.learn-chat-panel';

test.describe('Play with AI full journey', () => {
  test.describe.configure({ mode: 'serial' });

  test('register, verify, buy day pass, play, resume, sign out', async ({
    page,
    request,
  }, testInfo) => {
    const authedRequest = page.request;
    test.setTimeout(180_000);

    const email = uniqueTestEmail('e2e-journey', testInfo.parallelIndex);
    const password = 'e2e-password-12';
    const displayName = 'Journey Player';

    await stubPlayAiLlmRoutes(page);

    let checkoutSessionId = '';
    await page.route('**/api/billing/checkout', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const json = (await response.json()) as { sessionId?: string; url?: string };
      if (json.sessionId) checkoutSessionId = json.sessionId;
      await route.fulfill({
        status: response.status(),
        contentType: 'application/json',
        body: JSON.stringify({ ...json, url: '/play-ai' }),
      });
    });

    await page.goto('/login?mode=register');
    await page.getByLabel(/Display name/).fill(displayName);
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/register\/sent$/);

    await verifyEmailFromOutbox(request, page, email);

    await page.goto('/play-ai');
    await expect(page.getByRole('heading', { name: /Unlock Play with AI/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Buy day pass · \$1/i })).toBeEnabled();

    await page.getByRole('button', { name: /Buy day pass · \$1/i }).click();
    await expect.poll(() => checkoutSessionId, { timeout: 15_000 }).not.toBe('');
    await completeCheckout(authedRequest, { sessionId: checkoutSessionId });
    await page.unroute('**/api/billing/checkout');
    await stubPlayAiLlmRoutes(page);
    await expect
      .poll(async () => {
        const me = await authedRequest.get(`${e2eWebOrigin}/api/me`);
        if (!me.ok()) return false;
        const body = (await me.json()) as { access?: { active?: boolean } };
        return body.access?.active === true;
      })
      .toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await stubPlayAiLlmRoutes(page);
    await expect(page.getByTestId('play-ai-game')).toBeVisible({ timeout: 30_000 });
    const continueSaved = page.getByTestId('continue-saved-game');
    if (await continueSaved.isVisible()) {
      await page.getByRole('button', { name: 'Start a new game instead' }).click();
      await expect(page.getByTestId('play-ai-game')).toBeVisible();
    }
    await expect(page.locator(chat).getByText('Welcome to the E2E court!')).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.locator('[data-testid="board"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Your move \(Red\)/)).toBeVisible({ timeout: 30_000 });
    await playMove(page, [7, 1], [7, 4]);

    const panel = page.locator(chat);
    await expect(square(page, 7, 4)).toHaveAttribute('data-piece', 'rC', { timeout: 20_000 });
    await expect(panel.getByText('Stubbed feedback.')).toBeVisible({ timeout: 45_000 });

    const askInput = page.getByPlaceholder('Ask Master Lin…');
    await expect(askInput).toBeEnabled({ timeout: 45_000 });
    await askInput.fill('What should I do?');
    const sendAsk = page.getByRole('button', { name: 'Send' });
    await expect(sendAsk).toBeEnabled();
    await sendAsk.click();
    await expect(panel.locator('.chat-bubble-player').getByText('What should I do?')).toBeVisible({
      timeout: 15_000,
    });
    await expect(panel.getByText('Stubbed answer.')).toBeVisible({ timeout: 20_000 });

    await waitForActiveAiSave(authedRequest, 1, 30_000);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await stubPlayAiLlmRoutes(page);
    await expect(page.getByTestId('continue-saved-game')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('play-ai-game')).toBeVisible();
    await expect(page.getByText(/Resumed your game from/i)).toBeVisible();
    await expect(square(page, 7, 4)).toHaveAttribute('data-piece', 'rC');

    await page.goto('/play');
    const avatar = page.getByRole('button', { name: /Account menu/i });
    await avatar.click();
    const menu = page.getByRole('menu', { name: 'Account' });
    await expect(menu.getByText(displayName, { exact: true })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/play-ai$/);
    await expect(page.getByRole('status')).toContainText(
      "You're signed out. Your unfinished games are saved to your account.",
      { timeout: 15_000 },
    );
    await expect(page.getByRole('heading', { name: /Play with Master Lin/i })).toBeVisible();
  });
});
