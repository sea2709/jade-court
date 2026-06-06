/**
 * LLM façade — routes call these helpers, not provider modules directly.
 */
import { isLlmConfigured, llmModel, llmProviderId } from './config.js';
import { createProvider } from './providers/index.js';
import {
  COACH_FEEDBACK_SCHEMA,
  COACH_HINT_SCHEMA,
  COACH_OPENING_SCHEMA,
  MOVE_SCHEMA,
} from './schemas.js';
import type { LlmProvider, LlmProviderId } from './types.js';

let cachedProvider: LlmProvider | null = null;
let cachedProviderId: LlmProviderId | null = null;
let cachedModel: string | null = null;

export function getLlmProvider(): LlmProvider {
  const id = llmProviderId();
  const model = llmModel(id);
  if (!cachedProvider || cachedProviderId !== id || cachedModel !== model) {
    cachedProvider = createProvider(id);
    cachedProviderId = id;
    cachedModel = model;
  }
  return cachedProvider;
}

/** Clear cached provider — for tests when env changes between cases. */
export function resetLlmProviderCache(): void {
  cachedProvider = null;
  cachedProviderId = null;
  cachedModel = null;
}

export { isLlmConfigured, llmHistoryLimit } from './config.js';

export function llmGenerateMoveJson(system: string, user: string): Promise<string> {
  return getLlmProvider().generateJson({ system, user, schema: MOVE_SCHEMA });
}

export function llmGenerateCoachFeedbackJson(system: string, user: string): Promise<string> {
  return getLlmProvider().generateJson({ system, user, schema: COACH_FEEDBACK_SCHEMA });
}

export function llmGenerateCoachHintJson(system: string, user: string): Promise<string> {
  return getLlmProvider().generateJson({ system, user, schema: COACH_HINT_SCHEMA });
}

export function llmGenerateCoachOpeningJson(system: string, user: string): Promise<string> {
  return getLlmProvider().generateJson({ system, user, schema: COACH_OPENING_SCHEMA });
}

// Phase 2: coach SSE — llmStreamCoachText(system, user) via getLlmProvider().streamText()
