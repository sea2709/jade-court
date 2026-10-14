import { expect, test } from '@playwright/test';
import { adminLoginViaForm, json } from './helpers';

test.describe('admin news', () => {
  test('token gate, preview, publish flow', async ({ page }) => {
    await page.route(/\/api\/admin\/news/, async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return json(route, { items: [], nextCursor: null });
      }
      if (req.method() === 'POST' && req.url().endsWith('/preview')) {
        return json(route, {
          title: 'Preview title',
          description: 'Preview description long enough for validation later on.',
          imageUrl: 'https://cdn.example/p.jpg',
          publisher: 'Preview Pub',
          publishedAt: '2026-10-01',
          canonicalUrl: 'https://example.com/from-preview',
        });
      }
      if (req.method() === 'POST') {
        const body = req.postDataJSON() as Record<string, unknown>;
        expect(body).toMatchObject({
          sourceUrl: 'https://example.com/from-preview',
          status: 'published',
          title: 'Preview title',
        });
        return json(route, { id: 'new-1', ...body }, 201);
      }
      return json(route, { error: 'not_found' }, 404);
    });

    await adminLoginViaForm(page, { next: '/admin/news' });
    await expect(page.getByRole('button', { name: 'Add item' })).toBeVisible();

    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByLabel('Source URL').fill('https://example.com/from-preview');
    await page.getByRole('button', { name: 'Fetch details' }).click();
    await expect(page.getByLabel('Title')).toHaveValue('Preview title');
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByRole('button', { name: 'Add item' })).toBeVisible();
  });

  test('401 from news API redirects to login', async ({ page }) => {
    await adminLoginViaForm(page, { next: '/admin/news' });
    await page.route(/\/api\/admin\/news/, (route) => json(route, { error: 'unauthorized' }, 401));
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/login\?next=/);
    await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
  });
});
