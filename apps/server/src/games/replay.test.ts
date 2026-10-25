import { describe, expect, it } from 'vitest';
import { replaySavedMoves } from './replay.js';

describe('replaySavedMoves', () => {
  it('accepts a legal opening pair', () => {
    const result = replaySavedMoves([
      { from: [7, 1], to: [7, 4] },
      { from: [0, 1], to: [2, 2] },
    ]);
    expect(result).toEqual({ ok: true, status: null });
  });

  it('rejects an illegal move', () => {
    const result = replaySavedMoves([{ from: [7, 1], to: [0, 0] }]);
    expect(result).toEqual({ ok: false });
  });

  it('rejects moves after the game is over', () => {
    const result = replaySavedMoves([
      { from: [7, 1], to: [7, 4] },
      { from: [0, 1], to: [2, 2] },
      { from: [7, 4], to: [0, 4] },
    ]);
    expect(result.ok).toBe(false);
  });
});
