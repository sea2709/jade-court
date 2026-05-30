import { describe, expect, it } from 'vitest';
import * as X from './rules.js';

describe('xiangqi rules', () => {
  it('starts with 32 pieces', () => {
    const b = X.initialBoard();
    let n = 0;
    for (let r = 0; r < X.ROWS; r++)
      for (let c = 0; c < X.COLS; c++) if (b[r][c]) n++;
    expect(n).toBe(32);
  });

  it('red has legal opening moves', () => {
    expect(X.legalMoves(X.initialBoard(), 'r').length).toBeGreaterThan(0);
  });

  it('detects flying general', () => {
    const b = Array.from({ length: 10 }, () => Array(9).fill(null)) as ReturnType<
      typeof X.initialBoard
    >;
    b[9][4] = { t: 'G', s: 'r' };
    b[0][4] = { t: 'G', s: 'b' };
    expect(X.generalsFacing(b)).toBe(true);
    expect(X.inCheck(b, 'r')).toBe(true);
  });

  it('puzzle p1 cannon capture is legal', () => {
    const b = Array.from({ length: 10 }, () => Array(9).fill(null)) as ReturnType<
      typeof X.initialBoard
    >;
    b[9][4] = { t: 'G', s: 'r' };
    b[6][4] = { t: 'C', s: 'r' };
    b[3][4] = { t: 'S', s: 'b' };
    b[2][4] = { t: 'R', s: 'b' };
    b[0][3] = { t: 'G', s: 'b' };
    const moves = X.legalMoves(b, 'r');
    const capture = moves.find((m) => m.to[0] === 2 && m.to[1] === 4);
    expect(capture).toBeDefined();
  });
});
