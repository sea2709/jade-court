import { expect, test, type Page } from '@playwright/test';

const FAKE_OAUTH_EMAIL = 'fake-oauth@example.com';
const FAKE_OAUTH_CODE_NO_EMAIL = 'fake-oauth-code-no-email';

async function completeFakeOAuth(page: Page, code: string, returnTo = '/play-ai'): Promise<void> {
  const start = await page.request.get(
    `/api/auth/fake/start?returnTo=${encodeURIComponent(returnTo)}`,
    { maxRedirects: 0 },
  );
  expect(start.status()).toBe(302);
  const location = start.headers()['location'] ?? '';
  const state = new URL(location, 'http://localhost').searchParams.get('state');
  expect(state).toBeTruthy();

  const callback = await page.request.get(
    `/api/auth/fake/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state!)}`,
    { maxRedirects: 0 },
  );
  expect(callback.status()).toBe(302);
}

test.describe('Facebook OAuth (fake provider in test)', () => {
  test('Continue with Facebook signs in via fake OAuth', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    const facebook = page.getByRole('link', { name: 'Continue with Facebook' });
    await expect(facebook).toBeVisible();
    await expect(facebook).toHaveAttribute('href', /\/api\/auth\/fake\/start/);

    await facebook.click();
    await expect(page).toHaveURL(/\/play/, { timeout: 15_000 });

    await page.goto('/account');
    await expect(page.getByText(FAKE_OAUTH_EMAIL)).toBeVisible();
    await expect(page.getByText('Linked', { exact: true })).toBeVisible();
  });

  test('no-email Facebook sign-in shows add-email paywall with Buy disabled', async ({ page }) => {
    await completeFakeOAuth(page, FAKE_OAUTH_CODE_NO_EMAIL, '/play-ai');
    await page.goto('/play-ai');
    await expect(page.getByRole('heading', { name: /Unlock Play with AI/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Buy day pass/i })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Add your email' })).toBeVisible();
  });
});
