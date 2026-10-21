import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatAccessTimeLeft } from './formatAccessUntil';

describe('formatAccessTimeLeft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for missing value', () => {
    expect(formatAccessTimeLeft(null)).toBeNull();
  });

  it('formats minutes remaining', () => {
    const until = new Date('2026-01-01T12:25:00.000Z').toISOString();
    expect(formatAccessTimeLeft(until)).toBe('25 min left on day pass');
  });

  it('reports expired access', () => {
    const until = new Date('2026-01-01T11:00:00.000Z').toISOString();
    expect(formatAccessTimeLeft(until)).toBe('Day pass expired');
  });
});
