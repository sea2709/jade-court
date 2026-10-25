import type { LlmProvider, LlmProviderId } from '../types.js';
import { createAnthropicProvider } from './anthropic.js';
import { createGeminiProvider } from './gemini.js';
import { createOpenaiProvider } from './openai.js';

/** Construct a provider implementation for the given id and model id. */
export function createProvider(id: LlmProviderId, model: string): LlmProvider {
  switch (id) {
    case 'gemini':
      return createGeminiProvider(model);
    case 'openai':
      return createOpenaiProvider(model);
    case 'anthropic':
      return createAnthropicProvider(model);
  }
}
