import { llmModel, shouldLogLlmTokenUsage } from './config.js';
import type { LlmProviderId, LlmUsage } from './types.js';

/** Console log normalized token counts after a successful LLM call. */
export function logLlmTokenUsage(
  providerId: LlmProviderId,
  usage: LlmUsage | undefined,
): void {
  if (!shouldLogLlmTokenUsage()) return;
  if (!usage) {
    console.warn('[llm] tokens: usage missing from API response');
    return;
  }
  const prompt = usage.promptTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const total = usage.totalTokens ?? prompt + output;
  console.log(
    `[llm] tokens prompt=${prompt} output=${output} total=${total} provider=${providerId} model=${llmModel(providerId)}`,
  );
}
