/**
 * OpenAI provider — structured JSON via Chat Completions + json_schema.
 */
import OpenAI from 'openai';
import { apiKeyForProvider, llmModel } from '../config.js';
import { assertLlmConfigured, streamTextNotImplemented } from '../errors.js';
import { logLlmTokenUsage } from '../logUsage.js';
import { llmAbortSignal } from '../timeout.js';
import type { GenerateJsonParams, LlmProvider } from '../types.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const key = apiKeyForProvider('openai');
  assertLlmConfigured(Boolean(key));
  if (!client) client = new OpenAI({ apiKey: key! });
  return client;
}

export function createOpenaiProvider(): LlmProvider {
  const model = llmModel('openai');
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
      logLlmTokenUsage('openai', {
        promptTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
      });
      return response.choices[0]?.message?.content ?? '';
    },
    streamText: streamTextNotImplemented,
  };
}
