/**
 * POST /api/ai/move — LLM opponent (Learn mode).
 */
import { Hono } from 'hono';
import { computeLlmOpponentMove } from '../opponent/llmOpponentMove.js';
import { parseOpponentMoveBody } from '../opponent/parseRequest.js';
import { checkRateLimit } from '../llm/rateLimit.js';
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

  const result = await computeLlmOpponentMove(req);
  if (!result.ok) return c.json({ error: result.error }, result.status as 503);
  return c.json(result.body);
});

export default ai;
