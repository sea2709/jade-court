/**
 * POST /api/ai/move — Gemma opponent move with engine validation and negamax fallback.
 */
import { Hono } from 'hono';
import { AI, LLM, X } from '@jade-court/xiangqi-engine';
import type { AiMoveRequest, Board, Difficulty, Move, Side } from '@jade-court/xiangqi-engine';
import { generateMoveJson } from '../gemini/client.js';
import { isGemmaConfigured } from '../gemini/config.js';
import { checkRateLimit } from '../gemini/rateLimit.js';
import { getGuestId } from '../middleware/auth.js';

const ai = new Hono();

function isBoard(v: unknown): v is Board {
  if (!Array.isArray(v) || v.length !== X.ROWS) return false;
  return v.every(
    (row) =>
      Array.isArray(row) &&
      row.length === X.COLS &&
      row.every(
        (cell) =>
          cell === null ||
          (typeof cell === 'object' &&
            cell !== null &&
            (cell.s === 'r' || cell.s === 'b') &&
            typeof cell.t === 'string'),
      ),
  );
}

function parseBody(body: unknown): AiMoveRequest | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  if (!isBoard(o.board)) return null;
  if (o.side !== 'r' && o.side !== 'b') return null;
  const difficulty = o.difficulty as Difficulty;
  if (difficulty !== 'beginner' && difficulty !== 'intermediate' && difficulty !== 'advanced')
    return null;
  return {
    board: o.board,
    side: o.side,
    difficulty,
    lastMove: o.lastMove as AiMoveRequest['lastMove'],
    history: o.history as AiMoveRequest['history'],
  };
}

function negamaxFallback(
  board: Board,
  side: Side,
  difficulty: Difficulty,
): { move: Move; source: 'negamax' } {
  const move = AI.chooseMove(board, side, difficulty);
  if (!move) throw new Error('no_legal_moves');
  return { move, source: 'negamax' };
}

ai.post('/move', async (c) => {
  if (!isGemmaConfigured()) {
    return c.json({ error: 'gemma_unconfigured' }, 503);
  }

  const guestId = getGuestId(c);
  if (!checkRateLimit(guestId)) {
    return c.json({ error: 'rate_limit_exceeded' }, 429);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const req = parseBody(body);
  if (!req) return c.json({ error: 'invalid_request' }, 400);

  const legal = X.legalMoves(req.board, req.side);
  if (!legal.length) return c.json({ error: 'no_legal_moves' }, 400);

  try {
    const system = LLM.moveSelectionSystem(req.difficulty);
    const user = LLM.moveSelectionUser({
      board: req.board,
      side: req.side,
      difficulty: req.difficulty,
      legalMoves: legal,
      lastMove: req.lastMove,
      history: req.history,
    });
    const raw = await generateMoveJson(system, user);
    const parsed = LLM.parseMoveJson(raw);
    const move = parsed ? LLM.findLegalMove(req.board, req.side, parsed) : null;

    if (move) {
      let comment: string | undefined;
      try {
        const payload = JSON.parse(raw) as { comment?: string };
        if (typeof payload.comment === 'string' && payload.comment.trim())
          comment = payload.comment.trim();
      } catch {
        /* optional */
      }
      return c.json({ move, source: 'gemma', comment });
    }

    console.warn('[gemma] invalid move from model, using negamax fallback');
    return c.json(negamaxFallback(req.board, req.side, req.difficulty));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'gemma_unconfigured') return c.json({ error: 'gemma_unconfigured' }, 503);
    console.warn('[gemma] API error, negamax fallback:', msg);
    return c.json(negamaxFallback(req.board, req.side, req.difficulty));
  }
});

export default ai;
