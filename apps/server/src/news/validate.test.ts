import { describe, expect, it } from 'vitest';
import { validateCreateInput, validateUpdateInput } from './validate.js';
import type { NewsTag } from './types.js';

const publishedPayload = {
  sourceUrl: 'https://example.com/story',
  title: 'A fine Xiangqi headline here',
  summary: 'Twenty chars minimum summary written by our curators in plain language.',
  publisher: 'Example News',
  status: 'published',
  tags: ['culture'] as NewsTag[],
};

describe('validateCreateInput', () => {
  it('allows draft with only sourceUrl', () => {
    const r = validateCreateInput({ sourceUrl: 'https://example.com/x' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe('draft');
  });

  it('requires full fields when publishing', () => {
    const r = validateCreateInput({
      sourceUrl: 'https://example.com/x',
      status: 'published',
      title: 'Hi',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fields.summary).toBeDefined();
    }
  });

  it('accepts a valid published create', () => {
    const r = validateCreateInput(publishedPayload);
    expect(r.ok).toBe(true);
  });

  it('rejects javascript source URLs', () => {
    const r = validateCreateInput({ sourceUrl: 'javascript:alert(1)' });
    expect(r.ok).toBe(false);
  });

  it('rejects non-https imageUrl', () => {
    const r = validateCreateInput({
      ...publishedPayload,
      imageUrl: 'http://cdn.example.com/img.jpg',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fields.imageUrl).toBeDefined();
  });

  it('accepts curator upload path and rejects other relative URLs', () => {
    const uploaded = '/api/news/images/550e8400-e29b-41d4-a716-446655440000.webp';
    const ok = validateCreateInput({ ...publishedPayload, imageUrl: uploaded });
    expect(ok.ok).toBe(true);

    const rel = validateCreateInput({ ...publishedPayload, imageUrl: '/static/evil.png' });
    expect(rel.ok).toBe(false);
    if (!rel.ok) expect(rel.fields.imageUrl).toBeDefined();
  });
});

describe('validateUpdateInput', () => {
  const existing = {
    sourceUrl: 'https://example.com/old',
    normalizedUrl: 'https://example.com/old',
    sourceDomain: 'example.com',
    title: 'Old title here enough',
    summary: 'Existing summary that is at least twenty characters long.',
    publisher: 'Pub',
    tags: ['learning'] as NewsTag[],
    status: 'draft' as const,
  };

  it('allows unpublish to draft with only sourceUrl fields', () => {
    const r = validateUpdateInput(
      { status: 'draft' },
      {
        ...existing,
        status: 'published',
      },
    );
    expect(r.ok).toBe(true);
  });

  it('validates when publishing an incomplete draft', () => {
    const r = validateUpdateInput(
      { status: 'published' },
      {
        ...existing,
        title: '',
        summary: '',
        publisher: '',
      },
    );
    expect(r.ok).toBe(false);
  });
});
