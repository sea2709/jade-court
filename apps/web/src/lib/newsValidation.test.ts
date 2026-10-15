import { describe, expect, it } from 'vitest';
import { validateNewsDraft, validateNewsPublish } from './newsValidation';

describe('newsValidation', () => {
  it('requires http(s) source URL for drafts', () => {
    expect(validateNewsDraft({ sourceUrl: '' }).sourceUrl).toBeDefined();
    expect(validateNewsDraft({ sourceUrl: 'ftp://x.com' }).sourceUrl).toBeDefined();
    expect(validateNewsDraft({ sourceUrl: 'https://example.com/x' })).toEqual({});
  });

  it('accepts curator upload path for imageUrl', () => {
    const uploaded = '/api/news/images/550e8400-e29b-41d4-a716-446655440000.webp';
    const fields = {
      sourceUrl: 'https://example.com/x',
      title: 'Valid title for publish check',
      summary: 'Valid summary with at least twenty characters here.',
      publisher: 'Pub',
      publishedAt: '',
      imageUrl: uploaded,
      tags: [] as string[],
    };
    expect(validateNewsPublish(fields)).toEqual({});
  });

  it('rejects non-https external image URLs', () => {
    const fields = {
      sourceUrl: 'https://example.com/x',
      title: 'Valid title for publish check',
      summary: 'Valid summary with at least twenty characters here.',
      publisher: 'Pub',
      publishedAt: '',
      imageUrl: 'http://cdn.example/img.jpg',
      tags: [] as string[],
    };
    expect(validateNewsPublish(fields).imageUrl).toBeDefined();
  });

  it('enforces publish field lengths', () => {
    const base = {
      sourceUrl: 'https://example.com/x',
      title: 'Hi',
      summary: 'Too short',
      publisher: '',
      publishedAt: '',
      imageUrl: '',
      tags: [] as string[],
    };
    const errors = validateNewsPublish(base);
    expect(errors.summary).toBeDefined();
    expect(errors.publisher).toBeDefined();
  });
});
