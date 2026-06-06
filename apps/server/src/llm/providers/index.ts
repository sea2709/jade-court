import type { LlmProvider, LlmProviderId } from '../types.js';
import { createAnthropicProvider } from './anthropic.js';
import { createGeminiProvider } from './gemini.js';
import { createOpenaiProvider } from './openai.js';

/** Construct a provider implementation for the given id. */
export function createProvider(id: LlmProviderId): LlmProvider {
  switch (id) {
    case 'gemini':
      return createGeminiProvider();
    case 'openai':
      return createOpenaiProvider();
    case 'anthropic':
      return createAnthropicProvider();
  }
}
