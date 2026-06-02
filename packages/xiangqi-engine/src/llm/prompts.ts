/**
 * Prompt builders for Gemma opponent moves (#4) and Master Lin coach copy (#5).
 */
import { VERDICT } from '../coach.js';
import * as X from '../rules.js';
import type { Board, Difficulty, Move, Side, Verdict } from '../types.js';
import type { MoveHistoryEntry } from './types.js';
import { formatBoard, formatHistory, formatMoveList } from './format.js';

export interface MoveSelectionContext {
  board: Board;
  side: Side;
  difficulty: Difficulty;
  legalMoves: Move[];
  lastMove?: { from: [number, number]; to: [number, number] };
  history?: MoveHistoryEntry[];
  historyLimit?: number;
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
    'Respond with JSON only, no markdown: {"moveIndex": <number>,"comment":"short friendly sentence about your move"}',
    'Set moveIndex to the number of your chosen move from the legal moves list (e.g. 1 for the first listed move).',
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
    lines.push('', 'Recent history:', formatHistory(ctx.history, ctx.historyLimit ?? 150));
  }
  return lines.join('\n');
}

export interface CoachFeedbackContext {
  boardBefore: Board;
  move: Move;
  side: Side;
  verdict: Verdict;
  lossCp: number;
  moveDescription: string;
  bestMove?: Move | null;
  difficulty?: Difficulty;
  history?: MoveHistoryEntry[];
  historyLimit?: number;
}

export interface CoachHintContext {
  board: Board;
  side: Side;
  bestMove: Move;
  moveDescription: string;
  givesCheck: boolean;
  captures: boolean;
  difficulty?: Difficulty;
}

export function coachFeedbackSystem(): string {
  return [
    'You are Master Lin, a warm and patient Xiangqi (Chinese chess) teacher.',
    'The rules engine has already graded the student move — do NOT change or contradict the verdict.',
    'Respond with JSON only, no markdown: {"desc":"<one sentence>","body":"<1-2 sentences>"}',
    'desc: briefly narrate what the move did on the board.',
    'body: friendly coaching that matches the verdict; if a better move is listed, mention it gently.',
  ].join('\n');
}

export function coachFeedbackUser(ctx: CoachFeedbackContext): string {
  const v = VERDICT[ctx.verdict];
  const sideLabel = ctx.side === 'r' ? 'Red (student)' : 'Black';
  const from = X.squareName(ctx.side, ctx.move.from[0], ctx.move.from[1]);
  const to = X.squareName(ctx.side, ctx.move.to[0], ctx.move.to[1]);
  const lines = [
    `Student side: ${sideLabel}`,
    `Engine verdict: ${v.label} (${ctx.verdict}) — ${v.note}`,
    `Centipawn loss vs best: ${ctx.lossCp}`,
    `Move played: ${from} → ${to}`,
    `Move summary: ${ctx.moveDescription}`,
    '',
    'Position before the move (student perspective):',
    formatBoard(ctx.boardBefore, ctx.side),
  ];
  if (ctx.bestMove) {
    const bp = ctx.boardBefore[ctx.bestMove.from[0]]?.[ctx.bestMove.from[1]];
    if (bp) {
      const bestTo = X.squareName(ctx.side, ctx.bestMove.to[0], ctx.bestMove.to[1]);
      lines.push('', `Engine suggests instead: ${X.NAME[bp.t]} to ${bestTo}`);
    }
  }
  if (ctx.history?.length) {
    lines.push('', 'Recent history:', formatHistory(ctx.history, ctx.historyLimit ?? 150));
  }
  return lines.join('\n');
}

export function coachHintSystem(): string {
  return [
    'You are Master Lin, a patient Xiangqi teacher.',
    'The engine has already chosen the best move — do NOT suggest a different move.',
    'Respond with JSON only, no markdown: {"text":"<hint sentence>","tip":"<short piece tip>"}',
    'text: one encouraging sentence naming the piece to move and why it helps.',
    'tip: one short reminder about how that piece type moves.',
  ].join('\n');
}

export function coachHintUser(ctx: CoachHintContext): string {
  const sideLabel = ctx.side === 'r' ? 'Red (student)' : 'Black';
  const lines = [
    `Side to move: ${sideLabel}`,
    `Engine best move: ${ctx.moveDescription}`,
    ctx.givesCheck ? 'This move gives check.' : '',
    ctx.captures ? 'This move captures material.' : '',
    '',
    'Board (student perspective):',
    formatBoard(ctx.board, ctx.side),
  ].filter(Boolean);
  return lines.join('\n');
}

export function coachOpeningSystem(): string {
  return [
    'You are Master Lin welcoming a new student to Learn mode in a Xiangqi app.',
    'Respond with JSON only, no markdown: {"text":"<one warm welcoming sentence>"}',
    'Mention tapping pieces for legal moves; keep it under 35 words.',
  ].join('\n');
}

export function coachOpeningUser(difficulty?: Difficulty): string {
  const level =
    difficulty === 'advanced'
      ? 'experienced'
      : difficulty === 'intermediate'
        ? 'intermediate'
        : 'beginner';
  return `Student skill level: ${level}. Write a fresh welcome (not a generic template).`;
}
