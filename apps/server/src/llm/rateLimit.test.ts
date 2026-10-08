import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from './rateLimit.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checkRateLimit', () => {
  it('allows 30 calls per minute per guest, then blocks', () => {
    for (let i = 0; i < 30; i++) expect(checkRateLimit('rl-a')).toBe(true);
    expect(checkRateLimit('rl-a')).toBe(false);
  });

  it('tracks guests independently', () => {
    for (let i = 0; i < 31; i++) checkRateLimit('rl-b');
    expect(checkRateLimit('rl-c')).toBe(true);
  });

  it('resets after the window passes', () => {
    for (let i = 0; i < 31; i++) checkRateLimit('rl-d');
    expect(checkRateLimit('rl-d')).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(checkRateLimit('rl-d')).toBe(true);
  });
});
