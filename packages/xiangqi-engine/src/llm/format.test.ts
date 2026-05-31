import { describe, expect, it } from 'vitest';
import { formatHistory } from './format.js';
import type { MoveHistoryEntry } from './types.js';

function entry(side: 'r' | 'b', ply: number): MoveHistoryEntry {
  const r = ply % 10;
  const c = ply % 9;
  return { side, from: [r, c], to: [r, Math.min(c + 1, 8)] };
}

describe('formatHistory', () => {
  it('returns only the last N plies when limit is set', () => {
    const entries = [1, 2, 3, 4, 5].map((n) => entry('r', n));
    const lastTwo = formatHistory(entries.slice(-2), 2);
    const allFive = formatHistory(entries, 5);
    expect(lastTwo.split('\n')).toHaveLength(2);
    expect(formatHistory(entries, 2)).toBe(lastTwo);
    expect(allFive.split('\n')).toHaveLength(5);
    expect(formatHistory(entries, 2).length).toBeLessThan(allFive.length);
  });

  it('uses default limit 150 when omitted', () => {
    const entries = Array.from({ length: 200 }, (_, i) => entry(i % 2 === 0 ? 'r' : 'b', i));
    const lines = formatHistory(entries).split('\n');
    expect(lines).toHaveLength(150);
  });
});
