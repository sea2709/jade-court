/**
 * Shared DTOs for Gemma / Gemini API routes (opponent moves in #4; coach in #5).
 */
import type { Board, Coord, Difficulty, Move, Side, Verdict } from '../types.js';

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
  source: 'llm' | 'engine' | 'negamax';
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

export interface CoachFeedbackRequest {
  boardBefore: Board;
  move: Move;
  side: Side;
  depth?: number;
  difficulty?: Difficulty;
  history?: MoveHistoryEntry[];
}

export interface CoachFeedbackResponse {
  verdict: Verdict;
  label: string;
  emoji: string;
  tone: string;
  lossCp: number;
  desc: string;
  body: string;
  source: 'llm' | 'template';
}

export interface CoachHintRequest {
  board: Board;
  side: Side;
  depth?: number;
  difficulty?: Difficulty;
}

export interface CoachHintResponse {
  move: Move;
  text: string;
  tip: string;
  source: 'llm' | 'template';
}

export interface CoachOpeningRequest {
  difficulty?: Difficulty;
}

export interface CoachOpeningResponse {
  text: string;
  source: 'llm' | 'template';
}

export interface CoachFeedbackPayload {
  desc?: string;
  body?: string;
}

export interface CoachHintPayload {
  text?: string;
  tip?: string;
}

export interface CoachOpeningPayload {
  text?: string;
}
