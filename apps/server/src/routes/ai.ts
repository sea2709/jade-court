/**
 * POST /api/ai/move — LLM opponent (Learn mode).
 */
import { Hono } from 'hono';
import { computeLlmOpponentMove } from '../opponent/llmOpponentMove.js';
import { parseOpponentMoveBody } from '../opponent/parseRequest.js';
import { llmUserRateLimit } from '../middleware/llmUserRateLimit.js';
import { requirePlayAccess } from '../middleware/playAccess.js';
import type { AppVariables } from '../types/hono.js';

const ai = new Hono<{ Variables: AppVariables }>();

ai.use('*', requirePlayAccess);
ai.use('*', llmUserRateLimit);

ai.post('/move', async (c) => {
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
