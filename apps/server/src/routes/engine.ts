/**
 * POST /api/engine/move — Pikafish UCI opponent with negamax fallback.
 */
import { Hono } from 'hono';
import { X } from '@jade-court/xiangqi-engine';
import type { AiMoveRequest, Board, Difficulty, Move, Side } from '@jade-court/xiangqi-engine';
import { getGuestId } from '../middleware/auth.js';
import { isPikafishConfigured } from '../engine/config.js';
import { getPikafishMove, negamaxFallback } from '../engine/move.js';

const engine = new Hono();

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

engine.post('/move', async (c) => {
  if (!isPikafishConfigured()) {
    return c.json({ error: 'pikafish_unconfigured' }, 503);
  }

  getGuestId(c);

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
    const move = await getPikafishMove(req.board, req.side, req.difficulty);
    return c.json({ move, source: 'engine' as const });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'pikafish_unconfigured') return c.json({ error: 'pikafish_unconfigured' }, 503);
    console.warn('[pikafish] engine error, negamax fallback:', msg);
    return c.json(negamaxFallback(req.board, req.side, req.difficulty));
  }
});

export default engine;
