import { expect, test } from '@playwright/test';

const uniqueEmail = () => `e2e-player-${Date.now()}@jade-court.test`;
const SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? 3101);
const serverUrl = `http://127.0.0.1:${SERVER_PORT}`;

test.describe('player auth', () => {
  test('register, avatar menu, sign out with notice', async ({ page }) => {
    const email = uniqueEmail();
    const password = 'e2e-password-12';

    await page.goto('/register');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByLabel(/Display name/).fill('E2E Player');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/register\/sent$/);
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

    await page.goto('/play');
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

  test('register, verify email via test outbox, account shows verified', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail();
    const password = 'e2e-password-12';

    await page.goto('/register');
    await page.getByLabel(/Display name/).fill('E2E Verifier');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/register\/sent$/);

    let verifyLink: string | undefined;
    await expect(async () => {
      const outbox = await request.get(`${serverUrl}/api/auth/test-email-outbox`);
      expect(outbox.ok()).toBeTruthy();
      const body = (await outbox.json()) as {
        messages: { to: string; links: string[] }[];
      };
      const msg = body.messages.find((m) => m.to === email);
      expect(msg?.links?.length).toBeGreaterThan(0);
      verifyLink = msg!.links.find((l) => l.includes('/verify-email?token='));
      expect(verifyLink).toBeTruthy();
    }).toPass({ timeout: 15_000 });

    await page.goto(verifyLink!);
    await expect(page.getByText(/Your email is verified/i)).toBeVisible({ timeout: 15_000 });

    await page.goto('/account');
    await expect(page.getByText('Yes', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Email verification' })).toHaveCount(0);
  });
});
