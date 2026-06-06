import * as AI from './ai.js';
import * as X from './rules.js';
import type { Board, Move, PieceType, Side, Verdict } from './types.js';

export const PIECE_TIPS: Record<PieceType, string> = {
  G: 'Your General never leaves the palace — protect it at all costs.',
  A: 'Advisors guard the General, sliding one point diagonally inside the palace.',
  E: 'Elephants defend your own half and move two points diagonally — they can be blocked at the midpoint.',
  H: 'Horses move in an L, but a piece beside them "hobbles the leg" and blocks that direction.',
  R: 'Chariots are your strongest piece — they sweep entire ranks and files.',
  C: 'Cannons need a screen to capture: exactly one piece between them and their target.',
  S: 'Soldiers only move forward — but once they cross the river, they can step sideways too.',
};

export const VERDICT: Record<
  Verdict,
  { label: string; tone: string; emoji: string; note: string }
> = {
  great: { label: 'Great move!', tone: 'great', emoji: '★', note: "That's the engine's top pick." },
  good: { label: 'Good move', tone: 'good', emoji: '✓', note: 'Solid and principled.' },
  ok: { label: 'Playable', tone: 'ok', emoji: '•', note: 'Fine, though there was a touch better.' },
  inaccuracy: { label: 'Inaccuracy', tone: 'warn', emoji: '!?', note: 'A more active option was available.' },
  mistake: { label: 'Mistake', tone: 'bad', emoji: '?', note: 'This gives your opponent the edge.' },
  blunder: { label: 'Blunder', tone: 'bad', emoji: '??', note: 'This loses material or allows a strong reply.' },
};

export function describeMove(boardBefore: Board, move: Move): string {
  const p = boardBefore[move.from[0]][move.from[1]];
  if (!p) return 'Move made.';
  const captured = boardBefore[move.to[0]][move.to[1]];
  const name = X.NAME[p.t];
  const after = X.applyMove(boardBefore, move);
  const gaveCheck = X.inCheck(after, X.opp(p.s));
  let txt = `${name} `;
  if (captured) txt += `captures the ${X.NAME[captured.t]}`;
  else txt += 'advances';
  if (gaveCheck) txt += " — and it's check!";
  else txt += '.';
  return txt;
}

export function feedbackFor(boardBefore: Board, move: Move, s: Side, depth = 2) {
  const grade = AI.gradeMove(boardBefore, s, move, depth);
  const v = VERDICT[grade.verdict];
  const desc = describeMove(boardBefore, move);
  let body = v.note;
  if (
    (grade.verdict === 'inaccuracy' || grade.verdict === 'mistake' || grade.verdict === 'blunder') &&
    grade.best
  ) {
    const bp = boardBefore[grade.best.from[0]][grade.best.from[1]];
    if (bp)
      body += ` Consider ${X.NAME[bp.t]} to ${X.squareName(s, grade.best.to[0], grade.best.to[1])} instead.`;
  }
  return { verdict: grade.verdict, ...v, desc, body, best: grade.best, lossCp: grade.lossCp };
}

export function hint(board: Board, s: Side, depth = 2) {
  const { move } = AI.bestMove(board, s, depth);
  if (!move) return { move: null as Move | null, text: 'No legal moves — the game is over.', tip: '' };
  const p = board[move.from[0]][move.from[1]]!;
  const captured = board[move.to[0]][move.to[1]];
  const after = X.applyMove(board, move);
  const gaveCheck = X.inCheck(after, X.opp(s));
  let why: string;
  if (captured) why = `It wins the ${X.NAME[captured.t]} — grab the material.`;
  else if (gaveCheck) why = 'It delivers check and seizes the initiative.';
  else why = `It develops your ${X.NAME[p.t]} to a more active square.`;
  return {
    move,
    piece: p.t,
    text: `Try moving your ${X.NAME[p.t]}. ${why}`,
    tip: PIECE_TIPS[p.t],
  };
}

export function pieceTip(t: PieceType, count: number): string {
  const base = PIECE_TIPS[t] || '';
  if (count === 0) return `This ${X.NAME[t]} has no legal moves right now. ${base}`;
  return `${base} It has ${count} legal ${count === 1 ? 'move' : 'moves'} highlighted.`;
}

export function opening(): string {
  return "Welcome! I'm Master Lin. Tap any piece to see where it can go — green dots are open moves, gold rings are captures. Make your move and I'll talk you through it.";
}

export function checkAlert(s: Side): string {
  return s === 'r'
    ? 'Heads up — your General is in check! You must get out of it this move.'
    : "Check! Your opponent's General is under attack.";
}

export function askReply(): string {
  return 'Try the hint button for a strong move, or tap any piece to see where it can go.';
}
