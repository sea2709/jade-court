import { expect, test } from '@playwright/test';
import { adminLoginViaForm, json } from './helpers';

test.describe('admin login', () => {
  test('logged-out /admin/news redirects to login with next', async ({ page }) => {
    await page.goto('/admin/news');
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fnews/);
    await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
  });

  test('wrong password shows error', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Username').fill('wrong-user-e2e');
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid username or password.');
  });

  test('login, dashboard, news nav, and sign out', async ({ page }) => {
    await adminLoginViaForm(page);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.route(/\/api\/admin\/news/, (route) => json(route, { items: [], nextCursor: null }));
    await page
      .getByRole('navigation', { name: 'Admin sections' })
      .getByRole('link', { name: 'News', exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/news/);
    await expect(page.getByRole('button', { name: 'Add item' })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});
