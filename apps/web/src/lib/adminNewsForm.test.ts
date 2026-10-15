import { describe, expect, it } from 'vitest';
import type { AdminNewsItem } from './newsApi';
import { applyPreviewToForm, emptyAdminForm, formFromItem } from './adminNewsForm';

const item: AdminNewsItem = {
  id: '1',
  sourceUrl: 'https://example.com/a',
  normalizedUrl: 'https://example.com/a',
  title: 'T',
  summary: 'S',
  publisher: 'P',
  sourceDomain: 'example.com',
  sortAt: '2026-10-01T12:00:00.000Z',
  tags: ['culture'],
  status: 'draft',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
  publishedAt: '2026-10-05T08:00:00.000Z',
  imageUrl: 'https://cdn.example/i.jpg',
};

describe('adminNewsForm', () => {
  it('maps items and preview responses into form state', () => {
    expect(emptyAdminForm().sourceUrl).toBe('');
    expect(formFromItem(item).publishedAt).toBe('2026-10-05');
    const next = applyPreviewToForm(emptyAdminForm(), {
      title: 'New',
      description: 'Desc',
      imageUrl: null,
      publisher: 'Pub',
      publishedAt: null,
      canonicalUrl: 'https://example.com/canonical',
    });
    expect(next.sourceUrl).toBe('https://example.com/canonical');
    expect(next.title).toBe('New');
  });

  it('preview overwrites an uploaded thumbnail when preview has imageUrl', () => {
    const uploaded = '/api/news/images/550e8400-e29b-41d4-a716-446655440000.webp';
    const form = { ...emptyAdminForm(), imageUrl: uploaded };
    const next = applyPreviewToForm(form, {
      title: null,
      description: null,
      imageUrl: 'https://cdn.example/from-preview.jpg',
      publisher: null,
      publishedAt: null,
      canonicalUrl: null,
    });
    expect(next.imageUrl).toBe('https://cdn.example/from-preview.jpg');
  });
});
