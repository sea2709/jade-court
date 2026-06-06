/**
 * Google Gemini / Gemma provider — structured JSON via @google/genai.
 */
import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import { apiKeyForProvider, llmModel } from '../config.js';
import { assertLlmConfigured } from '../errors.js';
import { logLlmTokenUsage } from '../logUsage.js';
import { llmAbortSignal } from '../timeout.js';
import type { GenerateJsonParams, LlmProvider, LlmUsage, StreamTextParams } from '../types.js';

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const key = apiKeyForProvider('gemini');
  assertLlmConfigured(Boolean(key));
  if (!client) client = new GoogleGenAI({ apiKey: key! });
  return client;
}

function usageFromResponse(response: GenerateContentResponse): LlmUsage | undefined {
  const meta = response.usageMetadata;
  if (!meta) return undefined;
  return {
    promptTokens: meta.promptTokenCount,
    outputTokens: meta.candidatesTokenCount,
    totalTokens: meta.totalTokenCount,
  };
}

export function createGeminiProvider(): LlmProvider {
  const model = llmModel('gemini');
  return {
    id: 'gemini',
    model,
    async generateJson(params: GenerateJsonParams): Promise<string> {
      const ai = getClient();
      const signal = llmAbortSignal(params.signal);
      const response = await ai.models.generateContent({
        model,
        contents: params.user,
        config: {
          systemInstruction: params.system,
          responseMimeType: 'application/json',
          responseSchema: params.schema,
          abortSignal: signal,
        },
      });
      logLlmTokenUsage('gemini', usageFromResponse(response));
      return response.text ?? '';
    },
    async *streamText(params: StreamTextParams) {
      const ai = getClient();
      const signal = llmAbortSignal(params.signal);
      const responseStream = await ai.models.generateContentStream({
        model,
        contents: params.user,
        config: {
          systemInstruction: params.system,
          abortSignal: signal,
        },
      });
      let lastResponse: GenerateContentResponse | undefined;
      for await (const chunk of responseStream) {
        lastResponse = chunk;
        const text = chunk.text;
        if (text) yield text;
      }
      if (lastResponse) logLlmTokenUsage('gemini', usageFromResponse(lastResponse));
    },
  };
}
