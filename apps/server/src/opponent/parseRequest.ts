import { X } from '@jade-court/xiangqi-engine';
import type { AiMoveRequest, Board, Difficulty } from '@jade-court/xiangqi-engine';

function isBoard(v: unknown): v is Board {
  if (!Array.isArray(v) || v.length !== X.ROWS) return false;
  return v.every(
    (row) =>
      Array.isArray(row) &&
      row.length === X.COLS &&
      row.every(
        (cell) =>
          cell === null ||
          (typeof cell === 'object' &&
            cell !== null &&
            (cell.s === 'r' || cell.s === 'b') &&
            typeof cell.t === 'string'),
      ),
  );
}

export function parseOpponentMoveBody(body: unknown): AiMoveRequest | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  if (!isBoard(o.board)) return null;
  if (o.side !== 'r' && o.side !== 'b') return null;
  const difficulty = o.difficulty as Difficulty;
  if (difficulty !== 'beginner' && difficulty !== 'intermediate' && difficulty !== 'advanced')
    return null;
  return {
    board: o.board,
    side: o.side,
    difficulty,
    lastMove: o.lastMove as AiMoveRequest['lastMove'],
    history: o.history as AiMoveRequest['history'],
  };
}
