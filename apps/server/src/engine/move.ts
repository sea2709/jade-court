import { AI, UCI, X, boardToFen } from '@jade-court/xiangqi-engine';
import type { Board, Difficulty, Move, Side } from '@jade-court/xiangqi-engine';
import { engineMoveTimeoutMs, isPikafishConfigured, pikafishPath } from './config.js';
import { getUciEngine } from './uci.js';

export function resolveEngineMove(
  board: Board,
  side: Side,
  legal: Move[],
  uciMove: string,
): Move | null {
  try {
    const parsed = UCI.parseUciMove(uciMove);
    const match = legal.find(
      (m) =>
        m.from[0] === parsed.from[0] &&
        m.from[1] === parsed.from[1] &&
        m.to[0] === parsed.to[0] &&
        m.to[1] === parsed.to[1],
    );
    return match ?? null;
  } catch {
    return null;
  }
}

export async function getPikafishMove(
  board: Board,
  side: Side,
  difficulty: Difficulty,
): Promise<Move> {
  const path = pikafishPath();
  if (!path || !isPikafishConfigured()) {
    throw new Error('pikafish_unconfigured');
  }

  const legal = X.legalMoves(board, side);
  if (!legal.length) throw new Error('no_legal_moves');

  const fen = boardToFen(board, side);
  const { go } = UCI.uciSearchParams(difficulty);
  const engine = await getUciEngine(path);
  const uciBest = await engine.bestMove(`position fen ${fen}`, go, engineMoveTimeoutMs());
  const move = resolveEngineMove(board, side, legal, uciBest);
  if (!move) throw new Error('engine_illegal_move');

  return move;
}

export function negamaxFallback(
  board: Board,
  side: Side,
  difficulty: Difficulty,
): { move: Move; source: 'negamax' } {
  const move = AI.chooseMove(board, side, difficulty);
  if (!move) throw new Error('no_legal_moves');
  return { move, source: 'negamax' };
}
