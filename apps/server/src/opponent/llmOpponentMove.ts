import { LLM, X } from '@jade-court/xiangqi-engine';
import type { AiMoveRequest, AiMoveResponse } from '@jade-court/xiangqi-engine';
import { generateMoveJson } from '../gemini/client.js';
import { gemmaHistoryLimit, isGemmaConfigured } from '../gemini/config.js';
import { negamaxFallback } from '../engine/move.js';

export type OpponentMoveResult =
  | { ok: true; body: AiMoveResponse }
  | { ok: false; status: number; error: string };

/** LLM opponent move with negamax fallback (Learn / PLAY_OPPONENT_PROVIDER=llm). */
export async function computeLlmOpponentMove(req: AiMoveRequest): Promise<OpponentMoveResult> {
  if (!isGemmaConfigured()) {
    return { ok: false, status: 503, error: 'llm_unconfigured' };
  }

  const legal = X.legalMoves(req.board, req.side);
  if (!legal.length) return { ok: false, status: 400, error: 'no_legal_moves' };

  try {
    const system = LLM.moveSelectionSystem(req.difficulty);
    const user = LLM.moveSelectionUser({
      board: req.board,
      side: req.side,
      difficulty: req.difficulty,
      legalMoves: legal,
      lastMove: req.lastMove,
      history: req.history,
      historyLimit: gemmaHistoryLimit(),
    });
    const raw = await generateMoveJson(system, user);
    const resolved = LLM.resolveModelMove(req.board, req.side, legal, raw);
    const move = resolved?.move ?? null;

    if (move) {
      return { ok: true, body: { move, source: 'llm', comment: resolved?.comment } };
    }

    console.warn('[llm] invalid move from model, using negamax fallback');
    return { ok: true, body: negamaxFallback(req.board, req.side, req.difficulty) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'llm_unconfigured') {
      return { ok: false, status: 503, error: 'llm_unconfigured' };
    }
    console.warn('[llm] API error, negamax fallback:', msg);
    return { ok: true, body: negamaxFallback(req.board, req.side, req.difficulty) };
  }
}
