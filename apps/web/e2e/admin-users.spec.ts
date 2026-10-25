import { expect, test } from '@playwright/test';
import { adminLoginViaForm } from './helpers';

const uniqueEmail = () => `e2e-admin-user-${Date.now()}@jade-court.test`;
const SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? 3101);
const serverUrl = `http://127.0.0.1:${SERVER_PORT}`;

test.describe('admin users', () => {
  test('search registered player and grant 24 hours access', async ({ page, request }) => {
    const email = uniqueEmail();
    const password = 'e2e-password-12';

    const registerRes = await request.post(`${serverUrl}/api/auth/register`, {
      data: {
        email,
        password,
        displayName: 'E2E Admin Target',
      },
    });
    expect(registerRes.ok()).toBeTruthy();

    await adminLoginViaForm(page, { next: '/admin/users' });
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

    await page.getByLabel('Search users by email').fill(email);

    const userRow = page.getByRole('button', { name: /E2E Admin Target/i });
    await expect(userRow).toBeVisible({ timeout: 15_000 });
    await userRow.click();

    const detail = page.getByRole('region', { name: 'User detail' });
    await expect(detail).toBeVisible();
    await expect(detail.getByText(email, { exact: true }).first()).toBeVisible();

    await detail.getByRole('button', { name: 'Grant access' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Hours')).toHaveValue('24');
    await dialog.getByRole('button', { name: 'Confirm grant' }).click();

    await expect(page.getByText(/Active until/i)).toBeVisible({ timeout: 15_000 });
  });
});
