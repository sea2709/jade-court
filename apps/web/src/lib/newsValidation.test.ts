import { describe, expect, it } from 'vitest';
import { validateNewsDraft, validateNewsPublish } from './newsValidation';

describe('newsValidation', () => {
  it('requires http(s) source URL for drafts', () => {
    expect(validateNewsDraft({ sourceUrl: '' }).sourceUrl).toBeDefined();
    expect(validateNewsDraft({ sourceUrl: 'ftp://x.com' }).sourceUrl).toBeDefined();
    expect(validateNewsDraft({ sourceUrl: 'https://example.com/x' })).toEqual({});
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
