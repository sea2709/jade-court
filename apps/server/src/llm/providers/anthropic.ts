/**
 * Anthropic provider — JSON via Messages API; streaming for coach SSE.
 */
import Anthropic from '@anthropic-ai/sdk';
import { apiKeyForProvider } from '../config.js';
import { assertLlmConfigured } from '../errors.js';
import { logLlmTokenUsage } from '../logUsage.js';
import { llmAbortSignal } from '../timeout.js';
import type { GenerateJsonParams, LlmProvider, StreamTextParams } from '../types.js';

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

export function createAnthropicProvider(model: string): LlmProvider {
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
      logLlmTokenUsage(
        'anthropic',
        {
          promptTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        { model, logContext: params.logContext },
      );
      return extractText(response.content);
    },
    async *streamText(params: StreamTextParams) {
      const anthropic = getClient();
      const signal = llmAbortSignal(params.signal);
      const stream = anthropic.messages.stream(
        {
          model,
          max_tokens: 1024,
          system: params.system,
          messages: [{ role: 'user', content: params.user }],
        },
        { signal },
      );
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta' &&
          event.delta.text
        ) {
          yield event.delta.text;
        }
      }
      const final = await stream.finalMessage();
      logLlmTokenUsage(
        'anthropic',
        {
          promptTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
          totalTokens: final.usage.input_tokens + final.usage.output_tokens,
        },
        { model, logContext: params.logContext },
      );
    },
  };
}
