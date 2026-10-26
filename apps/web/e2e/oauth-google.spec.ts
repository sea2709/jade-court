import { expect, test } from '@playwright/test';

const FAKE_OAUTH_EMAIL = 'fake-oauth@example.com';

test.describe('Google OAuth (fake provider in test)', () => {
  test('Continue with Google signs in via fake OAuth', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    const google = page.getByRole('link', { name: 'Continue with Google' });
    await expect(google).toBeVisible();
    await expect(google).toHaveAttribute('href', /\/api\/auth\/fake\/start/);

    await google.click();
    await expect(page).toHaveURL(/\/play/, { timeout: 15_000 });

    await page.goto('/account');
    await expect(page.getByText(FAKE_OAUTH_EMAIL)).toBeVisible();
    await expect(page.getByText('Linked', { exact: true })).toBeVisible();
  });
});
