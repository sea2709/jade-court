import { afterEach, describe, expect, it } from 'vitest';
import { X } from '@jade-court/xiangqi-engine';
import type { Board } from '@jade-court/xiangqi-engine';
import { getPikafishMove, negamaxFallback, resolveEngineMove } from './move.js';

const savedPath = process.env.PIKAFISH_PATH;

afterEach(() => {
  if (savedPath === undefined) delete process.env.PIKAFISH_PATH;
  else process.env.PIKAFISH_PATH = savedPath;
});

function matedBlack(): Board {
  const b = Array.from({ length: 10 }, () => Array(9).fill(null)) as Board;
  b[9][3] = { t: 'G', s: 'r' };
  b[0][4] = { t: 'G', s: 'b' };
  b[0][0] = { t: 'R', s: 'r' };
  b[1][8] = { t: 'R', s: 'r' };
  return b;
}

describe('resolveEngineMove', () => {
  const board = X.initialBoard();
  const legal = X.legalMoves(board, 'r');

  it('maps a UCI bestmove to the matching legal move', () => {
    expect(resolveEngineMove(board, 'r', legal, 'h2e2')).toMatchObject({
      from: [7, 7],
      to: [7, 4],
    });
  });

  it('returns null for an illegal or malformed engine move', () => {
    expect(resolveEngineMove(board, 'r', legal, 'a0a5')).toBeNull();
    expect(resolveEngineMove(board, 'r', legal, '(none)')).toBeNull();
    expect(resolveEngineMove(board, 'r', legal, '')).toBeNull();
  });
});

describe('negamaxFallback', () => {
  it('returns a legal move tagged as negamax', () => {
    const board = X.initialBoard();
    const { move, source } = negamaxFallback(board, 'r', 'beginner');
    expect(source).toBe('negamax');
    expect(X.legalMoves(board, 'r')).toContainEqual(move);
  });

  it('throws when there are no legal moves', () => {
    expect(() => negamaxFallback(matedBlack(), 'b', 'beginner')).toThrow('no_legal_moves');
  });
});

describe('getPikafishMove', () => {
  it('throws pikafish_unconfigured without PIKAFISH_PATH', async () => {
    delete process.env.PIKAFISH_PATH;
    await expect(getPikafishMove(X.initialBoard(), 'r', 'beginner')).rejects.toThrow(
      'pikafish_unconfigured',
    );
  });

  it('throws pikafish_unconfigured when the binary does not exist', async () => {
    process.env.PIKAFISH_PATH = '/nonexistent/pikafish';
    await expect(getPikafishMove(X.initialBoard(), 'r', 'beginner')).rejects.toThrow(
      'pikafish_unconfigured',
    );
  });
});
