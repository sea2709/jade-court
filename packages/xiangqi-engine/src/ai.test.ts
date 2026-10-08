import { afterEach, describe, expect, it, vi } from 'vitest';
import * as AI from './ai.js';
import * as X from './rules.js';
import type { Board, Difficulty, Move, Piece } from './types.js';

function boardWith(...pieces: [number, number, Piece][]): Board {
  const b = Array.from({ length: 10 }, () => Array(9).fill(null)) as Board;
  for (const [r, c, p] of pieces) b[r][c] = p;
  return b;
}

const isLegal = (b: Board, side: 'r' | 'b', m: Move | null) =>
  !!m &&
  X.legalMoves(b, side).some(
    (l) =>
      l.from[0] === m.from[0] &&
      l.from[1] === m.from[1] &&
      l.to[0] === m.to[0] &&
      l.to[1] === m.to[1],
  );

/** Red chariot can take an undefended Black chariot on the same rank. */
const hangingChariot = () =>
  boardWith(
    [9, 3, { t: 'G', s: 'r' }],
    [0, 5, { t: 'G', s: 'b' }],
    [5, 0, { t: 'R', s: 'r' }],
    [5, 8, { t: 'R', s: 'b' }],
  );

/** Red mates with Chariot [5,0] -> [0,0]; the other chariot covers rank 1. */
const mateInOne = () =>
  boardWith(
    [9, 3, { t: 'G', s: 'r' }],
    [0, 4, { t: 'G', s: 'b' }],
    [5, 0, { t: 'R', s: 'r' }],
    [1, 8, { t: 'R', s: 'r' }],
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('evaluate', () => {
  it('scores the opening position as equal for both sides', () => {
    const b = X.initialBoard();
    expect(AI.evaluate(b, 'r')).toBe(0);
    expect(AI.evaluate(b, 'b')).toBe(0);
  });

  it('is symmetric between the two sides', () => {
    const b = hangingChariot();
    b[5][8] = null;
    expect(AI.evaluate(b, 'r')).toBeGreaterThan(0);
    expect(AI.evaluate(b, 'r')).toBe(-AI.evaluate(b, 'b'));
  });
});

describe('bestMove', () => {
  it('finds a game-ending move in one (stalemate is also a loss in Xiangqi)', () => {
    const b = mateInOne();
    const { move, score } = AI.bestMove(b, 'r', 1);
    expect(move).not.toBeNull();
    expect(score).toBeGreaterThanOrEqual(100000);
    expect(X.gameStatus(X.applyMove(b, move!), 'b')).not.toBeNull();
  });

  it('scores the chariot mate as a win', () => {
    const b = mateInOne();
    const mate = { from: [5, 0], to: [0, 0] } as Move;
    expect(X.gameStatus(X.applyMove(b, mate), 'b')).toBe('checkmate');
    const { scored } = AI.bestMove(b, 'r', 1);
    const mateScore = scored.find((s) => s.m.to[0] === 0 && s.m.to[1] === 0 && s.m.from[1] === 0);
    expect(mateScore?.val).toBeGreaterThanOrEqual(100000);
  });

  it('takes a hanging chariot', () => {
    const { move } = AI.bestMove(hangingChariot(), 'r', 2);
    expect(move).toMatchObject({ from: [5, 0], to: [5, 8] });
  });

  it('returns no move when the side has no legal moves', () => {
    const stalemate = boardWith(
      [9, 3, { t: 'G', s: 'r' }],
      [0, 4, { t: 'G', s: 'b' }],
      [1, 0, { t: 'R', s: 'r' }],
      [5, 3, { t: 'R', s: 'r' }],
      [5, 5, { t: 'R', s: 'r' }],
    );
    const res = AI.bestMove(stalemate, 'b', 2);
    expect(res.move).toBeNull();
    expect(res.score).toBe(-100000);
  });
});

describe('chooseMove', () => {
  it.each<Difficulty>(['beginner', 'intermediate'])(
    'returns a legal opening move at %s',
    (difficulty) => {
      const b = X.initialBoard();
      expect(isLegal(b, 'r', AI.chooseMove(b, 'r', difficulty))).toBe(true);
    },
  );

  it('returns a legal move at advanced on a sparse board', () => {
    const b = hangingChariot();
    const move = AI.chooseMove(b, 'r', 'advanced');
    expect(isLegal(b, 'r', move)).toBe(true);
    expect(move).toMatchObject({ to: [5, 8] });
  });

  it('beginner sometimes plays a random legal move', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const b = X.initialBoard();
    expect(AI.chooseMove(b, 'r', 'beginner')).toEqual(X.legalMoves(b, 'r')[0]);
  });

  it('returns null when there are no legal moves', () => {
    const b = boardWith(
      [9, 3, { t: 'G', s: 'r' }],
      [0, 4, { t: 'G', s: 'b' }],
      [0, 0, { t: 'R', s: 'r' }],
      [1, 8, { t: 'R', s: 'r' }],
    );
    expect(AI.chooseMove(b, 'b', 'intermediate')).toBeNull();
  });
});

describe('gradeMove', () => {
  it('rates the best move as great', () => {
    const b = hangingChariot();
    const res = AI.gradeMove(b, 'r', { from: [5, 0], to: [5, 8] });
    expect(res.verdict).toBe('great');
    expect(res.lossCp).toBe(0);
  });

  it('rates leaving the chariot en prise as a blunder', () => {
    const b = hangingChariot();
    const res = AI.gradeMove(b, 'r', { from: [9, 3], to: [8, 3] });
    expect(res.verdict).toBe('blunder');
    expect(res.lossCp).toBeGreaterThan(700);
    expect(res.best).toMatchObject({ to: [5, 8] });
  });
});
