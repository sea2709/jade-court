import { expect, test } from '@playwright/test';

const VALID_CODE = 'a1b2c3d4e5f6789012345678abcdef01';

test.describe('Facebook data deletion status', () => {
  test('shows confirmation code from status URL', async ({ page }) => {
    await page.goto(`/account/data-deletion?code=${VALID_CODE}`);
    await expect(page.getByRole('heading', { name: /Data deletion request/i })).toBeVisible();
    await expect(page.getByTestId('data-deletion-confirmation-code')).toHaveText(VALID_CODE);
  });

  test('shows error when code query param is invalid', async ({ page }) => {
    await page.goto('/account/data-deletion?code=broken');
    await expect(page.getByRole('alert')).toContainText(/does not look valid/i);
  });
});
