import { describe, expect, it } from 'vitest';
import * as X from './rules.js';
import { PIKAFISH_START_FEN, boardFromFenPlacement, boardToFen } from './fen.js';
import { jadeToUciSquare, parseUciMove } from './uci/parse.js';

describe('fen', () => {
  it('encodes the standard start position', () => {
    const fen = boardToFen(X.initialBoard(), 'r');
    expect(fen).toBe(PIKAFISH_START_FEN);
  });

  it('round-trips placement from start FEN', () => {
    const board = boardFromFenPlacement(PIKAFISH_START_FEN);
    expect(boardToFen(board, 'r')).toBe(PIKAFISH_START_FEN);
  });
});

describe('uci parse', () => {
  it('maps jade coords to UCI squares', () => {
    expect(jadeToUciSquare([7, 7])).toBe('h2');
    expect(jadeToUciSquare([9, 4])).toBe('e0');
  });

  it('parses a UCI move', () => {
    const m = parseUciMove('h2e2');
    expect(m.from).toEqual([7, 7]);
    expect(m.to).toEqual([7, 4]);
  });
});
