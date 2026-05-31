/**
 * Text representations of board state for LLM prompts.
 */
import * as X from '../rules.js';
import type { Board, Coord, Move, Side } from '../types.js';
import type { MoveHistoryEntry } from './types.js';

const PIECE_LETTER: Record<string, string> = {
  rG: 'K',
  rA: 'A',
  rE: 'E',
  rH: 'H',
  rR: 'R',
  rC: 'C',
  rS: 'P',
  bG: 'k',
  bA: 'a',
  bE: 'e',
  bH: 'h',
  bR: 'r',
  bC: 'c',
  bS: 'p',
};

function pieceChar(p: { t: string; s: Side }): string {
  return PIECE_LETTER[`${p.s}${p.t}`] ?? '?';
}

/** ASCII board; rank 10 (red back rank) printed at bottom when perspective is red. */
export function formatBoard(board: Board, perspective: Side = 'r'): string {
  const rows: string[] = [];
  const rankNums = perspective === 'r' ? [...Array(X.ROWS)].map((_, i) => X.ROWS - i) : [...Array(X.ROWS)].map((_, i) => i + 1);
  const rowIndices = perspective === 'r' ? [...Array(X.ROWS)].map((_, i) => X.ROWS - 1 - i) : [...Array(X.ROWS)].map((_, i) => i);

  rows.push('   ' + [...Array(X.COLS)].map((_, c) => String(c + 1)).join(' '));
  for (let i = 0; i < X.ROWS; i++) {
    const r = rowIndices[i];
    const cells: string[] = [];
    for (let c = 0; c < X.COLS; c++) {
      const p = board[r][c];
      cells.push(p ? pieceChar(p) : '.');
    }
    rows.push(`${String(rankNums[i]).padStart(2)} ${cells.join(' ')}`);
  }
  return rows.join('\n');
}

export function formatMoveLine(board: Board, side: Side, move: Move, index: number): string {
  const p = board[move.from[0]][move.from[1]];
  const cap = board[move.to[0]][move.to[1]];
  const name = p ? X.NAME[p.t] : 'Piece';
  const from = X.squareName(side, move.from[0], move.from[1]);
  const to = X.squareName(side, move.to[0], move.to[1]);
  const capture = cap ? ` captures ${X.NAME[cap.t]}` : '';
  return `${index}. ${name} ${from} → ${to}${capture}`;
}

export function formatMoveList(board: Board, side: Side, moves: Move[]): string {
  if (!moves.length) return '(no legal moves)';
  return moves.map((m, i) => formatMoveLine(board, side, m, i + 1)).join('\n');
}

export function formatHistory(entries: MoveHistoryEntry[], limit = 150): string {
  if (!entries.length) return '(no moves yet)';
  const slice = entries.slice(-limit);
  return slice
    .map((e, i) => {
      const sideLabel = e.side === 'r' ? 'Red' : 'Black';
      const from = X.squareName(e.side, e.from[0], e.from[1]);
      const to = X.squareName(e.side, e.to[0], e.to[1]);
      return `${i + 1}. ${sideLabel}: ${from} → ${to}`;
    })
    .join('\n');
}
