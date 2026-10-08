import { describe, expect, it } from 'vitest';
import type { Coord } from '../types.js';
import { jadeToUciSquare, moveToUci, parseUciMove, uciToJadeSquare } from './parse.js';

describe('UCI square mapping', () => {
  it('round-trips every board square', () => {
    for (let r = 0; r < 10; r++)
      for (let c = 0; c < 9; c++) {
        const sq: Coord = [r, c];
        expect(uciToJadeSquare(jadeToUciSquare(sq))).toEqual(sq);
      }
  });

  it('maps the corners', () => {
    expect(jadeToUciSquare([0, 0])).toBe('a9');
    expect(jadeToUciSquare([9, 8])).toBe('i0');
  });

  it.each(['', 'a', 'j0', 'a10', 'ax'])('rejects invalid square %j', (sq) => {
    expect(() => uciToJadeSquare(sq)).toThrow('invalid_uci_square');
  });
});

describe('UCI move parsing', () => {
  it('round-trips moves', () => {
    for (const uci of ['h2e2', 'b0c2', 'a9a8', 'e3e4']) {
      expect(moveToUci(parseUciMove(uci))).toBe(uci);
    }
  });

  it('ignores trailing tokens such as ponder', () => {
    expect(parseUciMove('  h2e2 ponder h9g7 ')).toEqual({ from: [7, 7], to: [7, 4] });
  });

  it('rejects short input', () => {
    expect(() => parseUciMove('h2')).toThrow('invalid_uci_move');
    expect(() => parseUciMove('')).toThrow('invalid_uci_move');
  });

  it('rejects off-board squares inside a move', () => {
    expect(() => parseUciMove('z2e2')).toThrow('invalid_uci_square');
  });
});
