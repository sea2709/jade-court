/**
 * Pikafish UCI coordinate moves (e.g. h2e2) ↔ engine Move.
 */
import type { Coord, Move } from '../types.js';
import { uciRankToJadeRow } from '../fen.js';

export function jadeToUciSquare([row, col]: Coord): string {
  const file = String.fromCharCode(97 + col);
  const rank = 9 - row;
  return `${file}${rank}`;
}

export function uciToJadeSquare(square: string): Coord {
  if (square.length < 2) throw new Error('invalid_uci_square');
  const col = square.charCodeAt(0) - 97;
  const rank = Number.parseInt(square.slice(1), 10);
  if (col < 0 || col > 8 || !Number.isFinite(rank) || rank < 0 || rank > 9) {
    throw new Error('invalid_uci_square');
  }
  return [uciRankToJadeRow(rank), col];
}

/** Parse `bestmove` payload (first four chars from/to squares). */
export function parseUciMove(uci: string): Move {
  const trimmed = uci.trim().split(/\s+/)[0] ?? '';
  if (trimmed.length < 4) throw new Error('invalid_uci_move');
  const from = uciToJadeSquare(trimmed.slice(0, 2));
  const to = uciToJadeSquare(trimmed.slice(2, 4));
  return { from, to };
}

export function moveToUci(move: Move): string {
  return `${jadeToUciSquare(move.from)}${jadeToUciSquare(move.to)}`;
}
