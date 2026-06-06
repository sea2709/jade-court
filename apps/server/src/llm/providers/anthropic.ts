/**
 * Anthropic provider — JSON via system prompt + Messages API (parse fallback in engine).
 */
import Anthropic from '@anthropic-ai/sdk';
import { apiKeyForProvider, llmModel } from '../config.js';
import { assertLlmConfigured, streamTextNotImplemented } from '../errors.js';
import { logLlmTokenUsage } from '../logUsage.js';
import { llmAbortSignal } from '../timeout.js';
import type { GenerateJsonParams, LlmProvider } from '../types.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const key = apiKeyForProvider('anthropic');
  assertLlmConfigured(Boolean(key));
  if (!client) client = new Anthropic({ apiKey: key! });
  return client;
}

function extractText(content: Anthropic.Messages.Message['content']): string {
  return content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

export function createAnthropicProvider(): LlmProvider {
  const model = llmModel('anthropic');
  return {
    id: 'anthropic',
    model,
    async generateJson(params: GenerateJsonParams): Promise<string> {
      const anthropic = getClient();
      const signal = llmAbortSignal(params.signal);
      const system = [
        params.system,
        'Respond with JSON only, no markdown fences.',
        `JSON schema: ${JSON.stringify(params.schema)}`,
      ].join('\n\n');
      const response = await anthropic.messages.create(
        {
          model,
          max_tokens: 1024,
          system,
          messages: [{ role: 'user', content: params.user }],
        },
        { signal },
      );
      logLlmTokenUsage('anthropic', {
        promptTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      });
      return extractText(response.content);
    },
    streamText: streamTextNotImplemented,
  };
}
