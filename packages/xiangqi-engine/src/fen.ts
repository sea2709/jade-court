/**
 * Pikafish / Xiangqi FEN (rank 9 = black back rank, rank 0 = red back rank; files a–i).
 */
import type { Board, Piece, Side } from './types.js';
import { COLS, ROWS } from './rules.js';

/** Standard start position FEN (red to move). */
export const PIKAFISH_START_FEN =
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

const TO_FEN: Record<Side, Record<string, string>> = {
  r: { G: 'K', A: 'A', E: 'B', H: 'N', R: 'R', C: 'C', S: 'P' },
  b: { G: 'k', A: 'a', E: 'b', H: 'n', R: 'r', C: 'c', S: 'p' },
};

const FROM_FEN: Record<string, { t: Piece['t']; s: Side }> = {};
for (const s of ['r', 'b'] as Side[]) {
  for (const [t, ch] of Object.entries(TO_FEN[s])) {
    FROM_FEN[ch] = { t: t as Piece['t'], s };
  }
}

function pieceToChar(p: Piece): string {
  return TO_FEN[p.s][p.t];
}

/** Jade row 0–9 → Pikafish rank 9–0. */
export function jadeRowToUciRank(row: number): number {
  return 9 - row;
}

export function uciRankToJadeRow(rank: number): number {
  return 9 - rank;
}

/** Encode board + side to move as Pikafish FEN. */
export function boardToFen(board: Board, sideToMove: Side): string {
  const ranks: string[] = [];
  for (let fenRank = 9; fenRank >= 0; fenRank--) {
    const r = uciRankToJadeRow(fenRank);
    let rankStr = '';
    let empty = 0;
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) {
        empty++;
        continue;
      }
      if (empty > 0) {
        rankStr += String(empty);
        empty = 0;
      }
      rankStr += pieceToChar(p);
    }
    if (empty > 0) rankStr += String(empty);
    ranks.push(rankStr);
  }
  const stm = sideToMove === 'r' ? 'w' : 'b';
  return `${ranks.join('/')} ${stm} - - 0 1`;
}

/** Parse FEN piece placement into a board (active color ignored). */
export function boardFromFenPlacement(fen: string): Board {
  const placement = fen.split(/\s+/)[0] ?? '';
  const board: Board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const rankParts = placement.split('/');
  if (rankParts.length !== ROWS) {
    throw new Error('invalid_fen_ranks');
  }
  for (let i = 0; i < ROWS; i++) {
    const fenRank = 9 - i;
    const r = uciRankToJadeRow(fenRank);
    let c = 0;
    for (const ch of rankParts[i]!) {
      if (ch >= '1' && ch <= '9') {
        c += Number(ch);
        continue;
      }
      const piece = FROM_FEN[ch];
      if (!piece) throw new Error(`invalid_fen_piece:${ch}`);
      if (c >= COLS) throw new Error('invalid_fen_overflow');
      board[r][c] = { t: piece.t, s: piece.s };
      c++;
    }
    if (c !== COLS) throw new Error('invalid_fen_rank_width');
  }
  return board;
}
