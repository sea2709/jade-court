import { describe, expect, it } from 'vitest';
import * as Coach from './coach.js';
import * as X from './rules.js';
import type { Board, Piece } from './types.js';

function boardWith(...pieces: [number, number, Piece][]): Board {
  const b = Array.from({ length: 10 }, () => Array(9).fill(null)) as Board;
  for (const [r, c, p] of pieces) b[r][c] = p;
  return b;
}

const hangingChariot = () =>
  boardWith(
    [9, 3, { t: 'G', s: 'r' }],
    [0, 5, { t: 'G', s: 'b' }],
    [5, 0, { t: 'R', s: 'r' }],
    [5, 8, { t: 'R', s: 'b' }],
  );

describe('describeMove', () => {
  it('describes a quiet move', () => {
    expect(Coach.describeMove(X.initialBoard(), { from: [7, 1], to: [7, 4] })).toBe(
      'Cannon advances.',
    );
  });

  it('describes a capture', () => {
    expect(Coach.describeMove(hangingChariot(), { from: [5, 0], to: [5, 8] })).toBe(
      'Chariot captures the Chariot.',
    );
  });

  it('mentions check', () => {
    const b = boardWith(
      [9, 3, { t: 'G', s: 'r' }],
      [0, 4, { t: 'G', s: 'b' }],
      [5, 0, { t: 'R', s: 'r' }],
    );
    expect(Coach.describeMove(b, { from: [5, 0], to: [0, 0] })).toBe(
      "Chariot advances — and it's check!",
    );
  });

  it('handles an empty origin square', () => {
    expect(Coach.describeMove(X.initialBoard(), { from: [4, 4], to: [3, 4] })).toBe('Move made.');
  });
});

describe('feedbackFor', () => {
  it('praises the top move', () => {
    const fb = Coach.feedbackFor(hangingChariot(), { from: [5, 0], to: [5, 8] }, 'r');
    expect(fb.verdict).toBe('great');
    expect(fb.label).toBe(Coach.VERDICT.great.label);
    expect(fb.desc).toBe('Chariot captures the Chariot.');
  });

  it('suggests the better move after a blunder', () => {
    const fb = Coach.feedbackFor(hangingChariot(), { from: [9, 3], to: [8, 3] }, 'r');
    expect(fb.verdict).toBe('blunder');
    expect(fb.body).toContain('Consider Chariot to');
    expect(fb.best).toMatchObject({ to: [5, 8] });
  });
});

describe('hint', () => {
  it('recommends winning material', () => {
    const h = Coach.hint(hangingChariot(), 'r');
    expect(h.move).toMatchObject({ from: [5, 0], to: [5, 8] });
    expect(h.text).toContain('wins the Chariot');
    expect(h.tip).toBe(Coach.PIECE_TIPS.R);
  });

  it('reports game over when there are no legal moves', () => {
    const mated = boardWith(
      [9, 3, { t: 'G', s: 'r' }],
      [0, 4, { t: 'G', s: 'b' }],
      [0, 0, { t: 'R', s: 'r' }],
      [1, 8, { t: 'R', s: 'r' }],
    );
    const h = Coach.hint(mated, 'b');
    expect(h.move).toBeNull();
    expect(h.text).toMatch(/game is over/);
  });
});

describe('static coach text', () => {
  it('pieceTip pluralises legal move counts', () => {
    expect(Coach.pieceTip('H', 0)).toMatch(/^This Horse has no legal moves/);
    expect(Coach.pieceTip('H', 1)).toContain('1 legal move highlighted');
    expect(Coach.pieceTip('H', 3)).toContain('3 legal moves highlighted');
  });

  it('checkAlert differs per side', () => {
    expect(Coach.checkAlert('r')).toContain('your General is in check');
    expect(Coach.checkAlert('b')).toContain("opponent's General");
  });

  it('opening and askReply return guidance text', () => {
    expect(Coach.opening()).toContain('Master Lin');
    expect(Coach.askReply()).toContain('hint');
  });
});
