/**
 * Replay saved move plies from the standard start position through the engine.
 */
import { X, type Move } from '@jade-court/xiangqi-engine';
import type { ReplayMovesResult, SavedMove } from './types.js';

function isIntegerCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

function isOnBoard(r: number, c: number): boolean {
  return r >= 0 && r <= 9 && c >= 0 && c <= 8;
}

function isSavedMove(v: unknown): v is SavedMove {
  if (!v || typeof v !== 'object') return false;
  const m = v as SavedMove;
  const from = m.from;
  const to = m.to;
  if (!Array.isArray(from) || from.length !== 2 || !Array.isArray(to) || to.length !== 2) {
    return false;
  }
  const [fr, fc] = from;
  const [tr, tc] = to;
  return (
    isIntegerCoord(fr) &&
    isIntegerCoord(fc) &&
    isIntegerCoord(tr) &&
    isIntegerCoord(tc) &&
    isOnBoard(fr, fc) &&
    isOnBoard(tr, tc)
  );
}

/** Validate move array shape before replay. */
export function parseMovesArray(raw: unknown): SavedMove[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every(isSavedMove)) return null;
  return raw as SavedMove[];
}

/**
 * Replays plies from `initialBoard`. Illegal sequence or moves after game over → not ok.
 */
export function replaySavedMoves(moves: SavedMove[]): ReplayMovesResult {
  let board = X.initialBoard();
  let turn: 'r' | 'b' = 'r';

  for (const ply of moves) {
    const status = X.gameStatus(board, turn);
    if (status) {
      return { ok: false };
    }

    const [fr, fc] = ply.from;
    const [tr, tc] = ply.to;
    const mover = board[fr][fc];
    if (!mover || mover.s !== turn) {
      return { ok: false };
    }

    const legal = X.movesFrom(board, fr, fc);
    const match = legal.find((m: Move) => m.to[0] === tr && m.to[1] === tc);
    if (!match) {
      return { ok: false };
    }

    board = X.applyMove(board, match);
    turn = X.opp(mover.s);
  }

  return { ok: true, status: X.gameStatus(board, turn) };
}
