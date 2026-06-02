/**
 * POST /api/ai/move — Gemma opponent (Learn mode).
 */
import { Hono } from 'hono';
import { computeGemmaOpponentMove } from '../opponent/gemmaMove.js';
import { parseOpponentMoveBody } from '../opponent/parseRequest.js';
import { checkRateLimit } from '../gemini/rateLimit.js';
import { getGuestId } from '../middleware/auth.js';

const ai = new Hono();

ai.post('/move', async (c) => {
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

  const req = parseOpponentMoveBody(body);
  if (!req) return c.json({ error: 'invalid_request' }, 400);

  const result = await computeGemmaOpponentMove(req);
  if (!result.ok) return c.json({ error: result.error }, result.status as 503);
  return c.json(result.body);
});

export default ai;
