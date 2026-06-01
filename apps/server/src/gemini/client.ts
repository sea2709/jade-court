/**
 * Gemini API client for Gemma 4 structured move responses.
 */
import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import { geminiApiKey, gemmaModel, gemmaTimeoutMs, shouldLogGemmaTokenUsage } from './config.js';

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const key = geminiApiKey();
  if (!key) throw new Error('gemma_unconfigured');
  if (!client) client = new GoogleGenAI({ apiKey: key });
  return client;
}

const MOVE_SCHEMA = {
  type: 'object',
  properties: {
    moveIndex: { type: 'integer' },
    comment: { type: 'string' },
  },
  required: ['moveIndex'],
} as const;

function logGemmaTokenUsage(response: GenerateContentResponse): void {
  const meta = response.usageMetadata;
  if (!meta) {
    console.warn('[gemma] tokens: usageMetadata missing from API response');
    return;
  }
  const prompt = meta.promptTokenCount ?? 0;
  const output = meta.candidatesTokenCount ?? 0;
  const total = meta.totalTokenCount ?? 0;
  console.log(
    `[gemma] tokens prompt=${prompt} output=${output} total=${total} model=${gemmaModel()}`,
  );
}

export async function generateMoveJson(
  systemInstruction: string,
  userPrompt: string,
): Promise<string> {
  const ai = getClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), gemmaTimeoutMs());

  try {
    const response = await ai.models.generateContent({
      model: gemmaModel(),
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: MOVE_SCHEMA,
        abortSignal: controller.signal,
      },
    });
    if (shouldLogGemmaTokenUsage()) logGemmaTokenUsage(response);
    return response.text ?? '';
  } finally {
    clearTimeout(timer);
  }
}
