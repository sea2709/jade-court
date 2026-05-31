/**
 * Shared DTOs for Gemma / Gemini API routes (opponent moves in #4; coach in #5).
 */
import type { Board, Coord, Difficulty, Move, Side } from '../types.js';

export interface MoveHistoryEntry {
  side: Side;
  from: Coord;
  to: Coord;
}

export interface AiMoveRequest {
  board: Board;
  side: Side;
  difficulty: Difficulty;
  lastMove?: { from: Coord; to: Coord };
  history?: MoveHistoryEntry[];
}

export interface AiMoveResponse {
  move: Move;
  source: 'gemma' | 'negamax';
  comment?: string;
}

export interface ParsedMoveCoords {
  from: [number, number];
  to: [number, number];
}

export interface GemmaMovePayload {
  /** 1-based index into the numbered legal-moves list in the prompt. */
  moveIndex?: number;
  from?: [number, number];
  to?: [number, number];
  comment?: string;
}
