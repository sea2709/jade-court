/**
 * Gemini API client for Gemma 4 structured move responses.
 */
import { GoogleGenAI } from '@google/genai';
import { geminiApiKey, gemmaModel, gemmaTimeoutMs } from './config.js';

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
    from: {
      type: 'array',
      items: { type: 'integer' },
      minItems: 2,
      maxItems: 2,
    },
    to: {
      type: 'array',
      items: { type: 'integer' },
      minItems: 2,
      maxItems: 2,
    },
    comment: { type: 'string' },
  },
  required: ['from', 'to'],
} as const;

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
    return response.text ?? '';
  } finally {
    clearTimeout(timer);
  }
}
