import { shouldLogLlmTokenUsage } from './config.js';
import type { LlmLogContext, LlmProviderId, LlmUsage } from './types.js';

export interface LlmUsageLogMeta {
  model: string;
  logContext?: LlmLogContext;
}

/** Console log normalized token counts after a successful LLM call. */
export function logLlmTokenUsage(
  providerId: LlmProviderId,
  usage: LlmUsage | undefined,
  meta: LlmUsageLogMeta,
): void {
  if (!shouldLogLlmTokenUsage()) return;
  if (!usage) {
    console.warn('[llm] tokens: usage missing from API response');
    return;
  }
  const prompt = usage.promptTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const total = usage.totalTokens ?? prompt + output;
  const actor = meta.logContext
    ? `${meta.logContext.actorKind}=${meta.logContext.actorId}`
    : 'actor=unknown';
  const preset = meta.logContext?.presetId ? ` preset=${meta.logContext.presetId}` : '';
  console.log(
    `[llm] tokens prompt=${prompt} output=${output} total=${total} provider=${providerId} model=${meta.model} ${actor}${preset}`,
  );
}
