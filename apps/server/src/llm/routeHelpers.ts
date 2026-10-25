/**
 * Shared modelId resolution for coach and Learn opponent routes.
 */
import type { Context } from 'hono';
import type { AppVariables } from '../types/hono.js';
import { isLlmConfigured, isLlmConfiguredForSelection, type LlmCallOptions } from './client.js';
import { parseModelIdField, resolveLlmSelection, type LlmSelection } from './modelSelection.js';
import { llmLogContextFromRequest } from './preferredModel.js';
export type ModelRouteContext = {
  modelId?: string;
  selection: LlmSelection;
  llmOptions: LlmCallOptions;
};

export function resolveModelRouteContext(
  c: Context<{ Variables: AppVariables }>,
  body: Record<string, unknown>,
): { ok: true; ctx: ModelRouteContext } | { ok: false; status: 400; error: 'invalid_model' } {
  const parsed = parseModelIdField(body);
  if (!parsed.ok) {
    return { ok: false, status: 400, error: 'invalid_model' };
  }
  const modelId = parsed.modelId;
  const resolved = resolveLlmSelection(modelId);
  if (!resolved.ok) {
    return { ok: false, status: 400, error: 'invalid_model' };
  }
  const logContext = llmLogContextFromRequest(c, resolved.selection.presetId);
  return {
    ok: true,
    ctx: {
      modelId,
      selection: resolved.selection,
      llmOptions: { selection: resolved.selection, logContext },
    },
  };
}

/** Whether the resolved selection can call the LLM (503 when env default has no key). */
export function isResolvedLlmAvailable(ctx: ModelRouteContext): boolean {
  return isLlmAvailableForCall(ctx.selection);
}

/** Env default uses `isLlmConfigured`; explicit presets require that provider's key. */
export function isLlmAvailableForCall(selection: LlmSelection): boolean {
  if (selection.presetId) {
    return isLlmConfiguredForSelection(selection);
  }
  return isLlmConfigured();
}
