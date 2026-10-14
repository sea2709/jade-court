import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatNewsDateAbsolute, formatNewsDateRelative, newsDateIso } from './formatNewsDate';

describe('formatNewsDateRelative', () => {
  const now = new Date('2026-10-14T15:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns Just now under one minute', () => {
    expect(formatNewsDateRelative(undefined, '2026-10-14T14:59:30.000Z', { now })).toBe('Just now');
  });

  it('returns minutes ago on the same day', () => {
    expect(formatNewsDateRelative(undefined, '2026-10-14T14:30:00.000Z', { now })).toBe(
      '30 minutes ago',
    );
  });

  it('returns hours ago on the same day', () => {
    expect(formatNewsDateRelative(undefined, '2026-10-14T09:00:00.000Z', { now })).toBe(
      '6 hours ago',
    );
  });

  it('returns Yesterday for the previous calendar day', () => {
    expect(formatNewsDateRelative(undefined, '2026-10-13T20:00:00.000Z', { now })).toBe(
      'Yesterday',
    );
  });

  it('returns N days ago under seven days', () => {
    expect(formatNewsDateRelative(undefined, '2026-10-10T12:00:00.000Z', { now })).toBe(
      '4 days ago',
    );
  });

  it('formats older dates without year when current year', () => {
    expect(formatNewsDateRelative(undefined, '2026-10-06T12:00:00.000Z', { now })).toBe('Oct 6');
  });

  it('includes year when not the current year', () => {
    expect(formatNewsDateRelative(undefined, '2025-10-06T12:00:00.000Z', { now })).toBe(
      'Oct 6, 2025',
    );
  });

  it('prefers publishedAt over sortAt', () => {
    expect(
      formatNewsDateRelative('2026-10-13T12:00:00.000Z', '2026-10-01T12:00:00.000Z', { now }),
    ).toBe('Yesterday');
  });
});

describe('formatNewsDateAbsolute', () => {
  it('includes weekday and date', () => {
    expect(formatNewsDateAbsolute('2026-10-14T12:00:00.000Z')).toContain('October 14, 2026');
  });

  it('appends time when ISO has a time component', () => {
    const text = formatNewsDateAbsolute('2026-10-14T14:40:00.000Z');
    expect(text).toMatch(/9:40 AM|2:40 PM/);
  });
});

describe('newsDateIso', () => {
  it('uses publishedAt when set', () => {
    expect(newsDateIso('2026-01-01', '2026-02-02')).toBe('2026-01-01');
  });
});
