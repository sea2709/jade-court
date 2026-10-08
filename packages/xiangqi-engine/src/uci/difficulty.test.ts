import { describe, expect, it } from 'vitest';
import type { Difficulty } from '../types.js';
import { uciSearchParams } from './difficulty.js';

const depthOf = (d: Difficulty) => Number(uciSearchParams(d).go.replace('depth ', ''));

describe('uciSearchParams', () => {
  it('uses depth-limited search', () => {
    for (const d of ['beginner', 'intermediate', 'advanced'] as const) {
      expect(uciSearchParams(d).go).toMatch(/^depth \d+$/);
    }
  });

  it('searches deeper as difficulty increases', () => {
    expect(depthOf('beginner')).toBeLessThan(depthOf('intermediate'));
    expect(depthOf('intermediate')).toBeLessThan(depthOf('advanced'));
  });

  it('falls back to intermediate for unknown input', () => {
    expect(uciSearchParams('unknown' as Difficulty)).toEqual(uciSearchParams('intermediate'));
  });
});
