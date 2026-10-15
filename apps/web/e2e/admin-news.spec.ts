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

  test('upload thumbnail, publish, and show image on news feed', async ({ page }) => {
    const uploadedPath = '/api/news/images/550e8400-e29b-41d4-a716-446655440000.png';
    const publishedItem = {
      id: 'uploaded-1',
      sourceUrl: 'https://example.com/uploaded-story',
      title: 'Uploaded thumb headline',
      summary: 'Summary long enough for validation when publishing curated news.',
      publisher: 'E2E Pub',
      sourceDomain: 'example.com',
      imageUrl: uploadedPath,
      sortAt: '2026-10-14T12:00:00.000Z',
      tags: ['culture'],
    };

    await page.route('**/api/admin/news**', async (route) => {
      const req = route.request();
      if (req.method() === 'POST' && req.url().includes('/images')) {
        return json(route, { imageUrl: uploadedPath }, 201);
      }
      if (req.method() === 'GET') {
        return json(route, { items: [], nextCursor: null });
      }
      if (req.method() === 'POST' && req.url().endsWith('/api/admin/news')) {
        const body = req.postDataJSON() as Record<string, unknown>;
        expect(body.imageUrl).toBe(uploadedPath);
        return json(route, { ...publishedItem, ...body, id: 'uploaded-1' }, 201);
      }
      return json(route, { error: 'not_found' }, 404);
    });

    const png1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    await page.route('**/api/news**', (route) => {
      if (route.request().url().includes('/api/news/images/')) {
        return route.fulfill({ status: 200, contentType: 'image/png', body: png1x1 });
      }
      return json(route, { items: [publishedItem], nextCursor: null });
    });

    await adminLoginViaForm(page, { next: '/admin/news' });
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByLabel('Source URL').fill('https://example.com/uploaded-story');
    await page.getByLabel('Title').fill(publishedItem.title);
    await page.getByLabel(/Summary/).fill(publishedItem.summary);
    await page.getByLabel('Publisher').fill(publishedItem.publisher);

    await page.getByLabel('Upload thumbnail').setInputFiles({
      name: 'thumb.png',
      mimeType: 'image/png',
      buffer: png1x1,
    });
    await expect(page.getByLabel('Image URL (https)')).toHaveValue(uploadedPath);
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByRole('button', { name: 'Add item' })).toBeVisible();

    await page.goto('/news');
    const card = page.getByRole('link', {
      name: `${publishedItem.title} — ${publishedItem.publisher} (opens in new tab)`,
    });
    await expect(card).toBeVisible();
    await expect(card.locator('img')).toHaveAttribute('src', uploadedPath);
  });

  test('401 from news API redirects to login', async ({ page }) => {
    await adminLoginViaForm(page, { next: '/admin/news' });
    await page.route(/\/api\/admin\/news/, (route) => json(route, { error: 'unauthorized' }, 401));
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/login\?next=/);
    await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
  });
});
