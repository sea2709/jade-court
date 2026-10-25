/**
 * LLM façade — routes call these helpers, not provider modules directly.
 */
import { llmModel, llmProviderId } from './config.js';
import type { LlmSelection } from './modelSelection.js';
import { isSelectionConfigured } from './modelSelection.js';
import { createProvider } from './providers/index.js';
import {
  COACH_ASK_SCHEMA,
  COACH_FEEDBACK_SCHEMA,
  COACH_HINT_SCHEMA,
  COACH_OPENING_SCHEMA,
  MOVE_SCHEMA,
} from './schemas.js';
import type { LlmLogContext, LlmProvider, LlmProviderId } from './types.js';

const providerCache = new Map<string, LlmProvider>();

function cacheKey(provider: LlmProviderId, model: string): string {
  return `${provider}:${model}`;
}

export function getLlmProviderFor(selection?: LlmSelection): LlmProvider {
  const provider = selection?.provider ?? llmProviderId();
  const model = selection?.model ?? llmModel(provider);
  const key = cacheKey(provider, model);
  const cached = providerCache.get(key);
  if (cached) return cached;
  const instance = createProvider(provider, model);
  providerCache.set(key, instance);
  return instance;
}

/** Env-default provider (unchanged behavior for opponent LLM without modelId). */
export function getLlmProvider(): LlmProvider {
  return getLlmProviderFor();
}

/** Clear cached providers — for tests when env or presets change. */
export function resetLlmProviderCache(): void {
  providerCache.clear();
}

export function isLlmConfiguredForSelection(selection: LlmSelection): boolean {
  return isSelectionConfigured(selection);
}

export { isLlmConfigured, llmHistoryLimit } from './config.js';

export interface LlmCallOptions {
  selection?: LlmSelection;
  logContext?: LlmLogContext;
}

function callOpts(options?: LlmCallOptions) {
  return {
    selection: options?.selection,
    logContext: options?.logContext,
  };
}

export function llmGenerateMoveJson(
  system: string,
  user: string,
  options?: LlmCallOptions,
): Promise<string> {
  const { selection, logContext } = callOpts(options);
  return getLlmProviderFor(selection).generateJson({
    system,
    user,
    schema: MOVE_SCHEMA,
    logContext,
  });
}

export function llmGenerateCoachFeedbackJson(
  system: string,
  user: string,
  options?: LlmCallOptions,
): Promise<string> {
  const { selection, logContext } = callOpts(options);
  return getLlmProviderFor(selection).generateJson({
    system,
    user,
    schema: COACH_FEEDBACK_SCHEMA,
    logContext,
  });
}

export function llmGenerateCoachHintJson(
  system: string,
  user: string,
  options?: LlmCallOptions,
): Promise<string> {
  const { selection, logContext } = callOpts(options);
  return getLlmProviderFor(selection).generateJson({
    system,
    user,
    schema: COACH_HINT_SCHEMA,
    logContext,
  });
}

export function llmGenerateCoachOpeningJson(
  system: string,
  user: string,
  options?: LlmCallOptions,
): Promise<string> {
  const { selection, logContext } = callOpts(options);
  return getLlmProviderFor(selection).generateJson({
    system,
    user,
    schema: COACH_OPENING_SCHEMA,
    logContext,
  });
}

export function llmGenerateCoachAskJson(
  system: string,
  user: string,
  options?: LlmCallOptions,
): Promise<string> {
  const { selection, logContext } = callOpts(options);
  return getLlmProviderFor(selection).generateJson({
    system,
    user,
    schema: COACH_ASK_SCHEMA,
    logContext,
  });
}

export async function* llmStreamCoachText(
  system: string,
  user: string,
  options?: LlmCallOptions & { signal?: AbortSignal },
): AsyncGenerator<string> {
  const { selection, logContext, signal } = options ?? {};
  yield* getLlmProviderFor(selection).streamText({ system, user, signal, logContext });
}
