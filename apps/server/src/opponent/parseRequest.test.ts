import { describe, expect, it } from 'vitest';
import { X } from '@jade-court/xiangqi-engine';
import { parseOpponentMoveBody } from './parseRequest.js';

const valid = () => ({ board: X.initialBoard(), side: 'r', difficulty: 'intermediate' });

describe('parseOpponentMoveBody', () => {
  it('accepts a valid request and passes through history and lastMove', () => {
    const lastMove = { from: [0, 1], to: [2, 2] };
    const history = [lastMove];
    const req = parseOpponentMoveBody({ ...valid(), lastMove, history });
    expect(req).toMatchObject({ side: 'r', difficulty: 'intermediate', lastMove, history });
  });

  it.each([null, undefined, 'string', 42])('rejects non-object body %j', (body) => {
    expect(parseOpponentMoveBody(body)).toBeNull();
  });

  it('rejects a board with the wrong shape', () => {
    expect(parseOpponentMoveBody({ ...valid(), board: [] })).toBeNull();
    expect(parseOpponentMoveBody({ ...valid(), board: X.initialBoard().slice(0, 9) })).toBeNull();
    const shortRow = X.initialBoard();
    shortRow[0] = shortRow[0]!.slice(0, 8);
    expect(parseOpponentMoveBody({ ...valid(), board: shortRow })).toBeNull();
  });

  it('rejects pieces with an unknown side', () => {
    const b = X.initialBoard() as unknown as Record<string, unknown>[][];
    b[0]![0] = { t: 'R', s: 'x' };
    expect(parseOpponentMoveBody({ ...valid(), board: b })).toBeNull();
  });

  it('rejects an invalid side or difficulty', () => {
    expect(parseOpponentMoveBody({ ...valid(), side: 'red' })).toBeNull();
    expect(parseOpponentMoveBody({ ...valid(), difficulty: 'expert' })).toBeNull();
  });
});
