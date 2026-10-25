/**
 * OpenAI provider — structured JSON and streaming via Chat Completions.
 */
import OpenAI from 'openai';
import { apiKeyForProvider } from '../config.js';
import { assertLlmConfigured } from '../errors.js';
import { logLlmTokenUsage } from '../logUsage.js';
import { llmAbortSignal } from '../timeout.js';
import type { GenerateJsonParams, LlmProvider, StreamTextParams } from '../types.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const key = apiKeyForProvider('openai');
  assertLlmConfigured(Boolean(key));
  if (!client) client = new OpenAI({ apiKey: key! });
  return client;
}

export function createOpenaiProvider(model: string): LlmProvider {
  return {
    id: 'openai',
    model,
    async generateJson(params: GenerateJsonParams): Promise<string> {
      const openai = getClient();
      const signal = llmAbortSignal(params.signal);
      const response = await openai.chat.completions.create(
        {
          model,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'response',
              strict: true,
              schema: params.schema,
            },
          },
        },
        { signal },
      );
      logLlmTokenUsage(
        'openai',
        {
          promptTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens,
          totalTokens: response.usage?.total_tokens,
        },
        { model, logContext: params.logContext },
      );
      return response.choices[0]?.message?.content ?? '';
    },
    async *streamText(params: StreamTextParams) {
      const openai = getClient();
      const signal = llmAbortSignal(params.signal);
      const stream = await openai.chat.completions.create(
        {
          model,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.user },
          ],
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal },
      );
      let usage: OpenAI.Completions.CompletionUsage | undefined;
      for await (const chunk of stream) {
        if (chunk.usage) usage = chunk.usage;
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield text;
      }
      logLlmTokenUsage(
        'openai',
        usage
          ? {
              promptTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : undefined,
        { model, logContext: params.logContext },
      );
    },
  };
}
