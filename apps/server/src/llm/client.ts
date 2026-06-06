/**
 * LLM façade — routes call these helpers, not provider modules directly.
 */
import { isLlmConfigured, llmProviderId } from './config.js';
import { createProvider } from './providers/index.js';
import {
  COACH_FEEDBACK_SCHEMA,
  COACH_HINT_SCHEMA,
  COACH_OPENING_SCHEMA,
  MOVE_SCHEMA,
} from './schemas.js';
import type { LlmProvider } from './types.js';

let provider: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider {
  if (!provider) provider = createProvider(llmProviderId());
  return provider;
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
