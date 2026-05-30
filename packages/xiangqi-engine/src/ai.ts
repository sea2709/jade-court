import * as X from './rules.js';
import type { Board, Difficulty, Move, Side, Verdict } from './types.js';

function positional(b: Board, s: Side): number {
  let score = 0;
  for (let r = 0; r < X.ROWS; r++)
    for (let c = 0; c < X.COLS; c++) {
      const p = b[r][c];
      if (!p) continue;
      const sign = p.s === s ? 1 : -1;
      if (p.t === 'S') {
        const adv = p.s === 'r' ? 9 - r : r;
        score += sign * adv * 4;
        if (c >= 3 && c <= 5) score += sign * 6;
      }
      if ((p.t === 'H' || p.t === 'C') && c >= 2 && c <= 6) score += sign * 8;
      if (p.t === 'R') score += sign * 2;
    }
  return score;
}

export function evaluate(b: Board, s: Side): number {
  let mat = 0;
  for (let r = 0; r < X.ROWS; r++)
    for (let c = 0; c < X.COLS; c++) {
      const p = b[r][c];
      if (!p) continue;
      mat += (p.s === s ? 1 : -1) * X.VALUE[p.t];
    }
  return mat + positional(b, s);
}

function orderMoves(b: Board, moves: Move[]): Move[] {
  return moves
    .map((m) => {
      const tp = b[m.to[0]][m.to[1]];
      return { m, score: tp ? X.VALUE[tp.t] : 0 };
    })
    .sort((a, z) => z.score - a.score)
    .map((x) => x.m);
}

function negamax(b: Board, s: Side, depth: number, alpha: number, beta: number): number {
  const status = X.gameStatus(b, s);
  if (status === 'checkmate') return -100000 - depth;
  if (status === 'stalemate') return -100000 - depth;
  if (depth === 0) return evaluate(b, s);

  let best = -Infinity;
  const moves = orderMoves(b, X.legalMoves(b, s));
  for (const m of moves) {
    const nb = X.applyMove(b, m);
    const val = -negamax(nb, X.opp(s), depth - 1, -beta, -alpha);
    if (val > best) best = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }
  return best;
}

export function bestMove(b: Board, s: Side, depth: number) {
  const moves = orderMoves(b, X.legalMoves(b, s));
  if (!moves.length) return { move: null as Move | null, score: -100000, scored: [] as { m: Move; val: number }[] };
  let best: Move | null = null;
  let bestVal = -Infinity;
  const scored: { m: Move; val: number }[] = [];
  for (const m of moves) {
    const nb = X.applyMove(b, m);
    const val = -negamax(nb, X.opp(s), depth - 1, -Infinity, Infinity);
    scored.push({ m, val });
    if (val > bestVal) {
      bestVal = val;
      best = m;
    }
  }
  return { move: best, score: bestVal, scored };
}

export const DEPTH: Record<Difficulty, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

export function chooseMove(b: Board, s: Side, difficulty: Difficulty): Move | null {
  const depth = DEPTH[difficulty] || 2;
  const legal = X.legalMoves(b, s);
  if (!legal.length) return null;

  if (difficulty === 'beginner') {
    if (Math.random() < 0.45) return legal[Math.floor(Math.random() * legal.length)]!;
    const { scored } = bestMove(b, s, 1);
    scored.sort((a, z) => z.val - a.val);
    const pool = scored.slice(0, Math.min(3, scored.length));
    return pool[Math.floor(Math.random() * pool.length)]!.m;
  }
  if (difficulty === 'intermediate') {
    const { scored } = bestMove(b, s, depth);
    scored.sort((a, z) => z.val - a.val);
    if (scored.length > 1 && Math.random() < 0.2) return scored[1]!.m;
    return scored[0]!.m;
  }
  return bestMove(b, s, depth).move;
}

export function gradeMove(
  boardBefore: Board,
  s: Side,
  playedMove: Move,
  depth = 2,
): { verdict: Verdict; lossCp: number; best: Move | null } {
  const { move: best, score: bestScore } = bestMove(boardBefore, s, depth);
  const nb = X.applyMove(boardBefore, playedMove);
  const playedScore = -negamax(nb, X.opp(s), depth - 1, -Infinity, Infinity);
  const loss = bestScore - playedScore;
  const sameAsBest =
    best &&
    best.from[0] === playedMove.from[0] &&
    best.from[1] === playedMove.from[1] &&
    best.to[0] === playedMove.to[0] &&
    best.to[1] === playedMove.to[1];
  let verdict: Verdict;
  if (sameAsBest || loss <= 15) verdict = 'great';
  else if (loss <= 60) verdict = 'good';
  else if (loss <= 130) verdict = 'ok';
  else if (loss <= 300) verdict = 'inaccuracy';
  else if (loss <= 700) verdict = 'mistake';
  else verdict = 'blunder';
  return { verdict, lossCp: Math.max(0, Math.round(loss)), best };
}
