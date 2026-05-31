/**
 * Prompt builders for Gemma opponent move selection.
 */
import * as X from '../rules.js';
import type { Board, Difficulty, Move, Side } from '../types.js';
import type { MoveHistoryEntry } from './types.js';
import { formatBoard, formatHistory, formatMoveList } from './format.js';

export interface MoveSelectionContext {
  board: Board;
  side: Side;
  difficulty: Difficulty;
  legalMoves: Move[];
  lastMove?: { from: [number, number]; to: [number, number] };
  history?: MoveHistoryEntry[];
}

const DIFFICULTY_HINT: Record<Difficulty, string> = {
  beginner:
    'Play at beginner strength: prefer safe development, avoid sharp tactics, occasionally choose a reasonable but not the strongest move.',
  intermediate:
    'Play at intermediate strength: solid tactics and development; prefer good moves but allow small inaccuracies.',
  advanced: 'Play at advanced strength: choose the strongest practical move you can find.',
};

export function moveSelectionSystem(difficulty: Difficulty): string {
  return [
    'You are Master Lin, a patient Xiangqi (Chinese chess) teacher playing as the computer opponent.',
    'You must choose exactly ONE move from the numbered legal moves list.',
    'Respond with JSON only, no markdown: {"from":[row,col],"to":[row,col],"comment":"short friendly sentence about your move"}',
    'Coordinates use 0-based row and column (row 0 = Black back rank, row 9 = Red back rank; col 0–8 left to right).',
    DIFFICULTY_HINT[difficulty],
  ].join('\n');
}

export function moveSelectionUser(ctx: MoveSelectionContext): string {
  const sideLabel = ctx.side === 'r' ? 'Red' : 'Black';
  const inCheck = X.inCheck(ctx.board, ctx.side);
  const lines = [
    `Side to move: ${sideLabel}${inCheck ? ' (in check)' : ''}`,
    '',
    'Board (your perspective as the side to move):',
    formatBoard(ctx.board, ctx.side),
    '',
    'Legal moves (pick one by matching from/to coordinates):',
    formatMoveList(ctx.board, ctx.side, ctx.legalMoves),
  ];
  if (ctx.lastMove) {
    lines.push(
      '',
      `Last move: ${X.squareName(X.opp(ctx.side), ctx.lastMove.from[0], ctx.lastMove.from[1])} → ${X.squareName(X.opp(ctx.side), ctx.lastMove.to[0], ctx.lastMove.to[1])}`,
    );
  }
  if (ctx.history?.length) {
    lines.push('', 'Recent history:', formatHistory(ctx.history));
  }
  return lines.join('\n');
}
