/**
 * Learn opponent LLM routes (`/api/ai/*`).
 */
import { Hono } from 'hono';
import { computeLlmOpponentMove } from '../opponent/llmOpponentMove.js';
import { parseOpponentMoveBody } from '../opponent/parseRequest.js';
import { defaultPresetId, listAvailablePresets, toPublicModelOption } from '../llm/presets.js';
import { resolveModelRouteContext, isResolvedLlmAvailable } from '../llm/routeHelpers.js';
import { savePreferredModelIfAuthenticated } from '../llm/preferredModel.js';
import { llmUserRateLimit } from '../middleware/llmUserRateLimit.js';
import { requirePlayAccess } from '../middleware/playAccess.js';
import type { AppVariables } from '../types/hono.js';
import type { UserStore } from '../users/store.js';

export function createAiRoutes(deps: { userStore: UserStore }) {
  const ai = new Hono<{ Variables: AppVariables }>();

  ai.get('/models', (c) => {
    const models = listAvailablePresets().map(toPublicModelOption);
    return c.json({ models, defaultId: defaultPresetId() });
  });

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

    const o = body as Record<string, unknown>;
    const modelRoute = resolveModelRouteContext(c, o);
    if (!modelRoute.ok) {
      return c.json({ error: modelRoute.error }, modelRoute.status);
    }
    if (!isResolvedLlmAvailable(modelRoute.ctx)) {
      return c.json({ error: 'llm_unconfigured' }, 503);
    }

    await savePreferredModelIfAuthenticated(c, deps.userStore, modelRoute.ctx.modelId);

    const result = await computeLlmOpponentMove(req, modelRoute.ctx.llmOptions);
    if (!result.ok) return c.json({ error: result.error }, result.status as 503);
    return c.json(result.body);
  });

  return ai;
}

export default createAiRoutes;
