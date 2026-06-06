/**
 * POST /api/opponent/move — Play vs Computer; backend from PLAY_OPPONENT_PROVIDER.
 */
import { Hono } from 'hono';
import { X } from '@jade-court/xiangqi-engine';
import { playOpponentProvider } from '../engine/config.js';
import { getPikafishMove, negamaxFallback } from '../engine/move.js';
import { computeLlmOpponentMove } from '../opponent/llmOpponentMove.js';
import { parseOpponentMoveBody } from '../opponent/parseRequest.js';
import { checkRateLimit } from '../llm/rateLimit.js';
import { getGuestId } from '../middleware/auth.js';

const opponent = new Hono();

opponent.post('/move', async (c) => {
  const guestId = getGuestId(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const req = parseOpponentMoveBody(body);
  if (!req) return c.json({ error: 'invalid_request' }, 400);

  const legal = X.legalMoves(req.board, req.side);
  if (!legal.length) return c.json({ error: 'no_legal_moves' }, 400);

  const provider = playOpponentProvider();

  if (provider === 'local') {
    return c.json(negamaxFallback(req.board, req.side, req.difficulty));
  }

  if (provider === 'llm') {
    if (!checkRateLimit(guestId)) {
      return c.json({ error: 'rate_limit_exceeded' }, 429);
    }
    const result = await computeLlmOpponentMove(req);
    if (!result.ok) return c.json({ error: result.error }, result.status as 503);
    return c.json(result.body);
  }

  // engine (Pikafish)
  try {
    const move = await getPikafishMove(req.board, req.side, req.difficulty);
    return c.json({ move, source: 'engine' as const });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'pikafish_unconfigured') {
      console.warn('[pikafish] not configured, negamax fallback');
    } else {
      console.warn('[pikafish] engine error, negamax fallback:', msg);
    }
    return c.json(negamaxFallback(req.board, req.side, req.difficulty));
  }
});

export default opponent;
