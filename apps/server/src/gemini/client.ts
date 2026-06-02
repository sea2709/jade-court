/**
 * Gemini API client for Gemma 4 structured JSON responses.
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
    moveIndex: { type: 'integer' },
    comment: { type: 'string' },
  },
  required: ['moveIndex'],
} as const;

const COACH_FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    desc: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['desc', 'body'],
} as const;

const COACH_HINT_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    tip: { type: 'string' },
  },
  required: ['text', 'tip'],
} as const;

const COACH_OPENING_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
  },
  required: ['text'],
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GemmaJsonSchema = Record<string, any>;

async function generateJson(
  systemInstruction: string,
  userPrompt: string,
  responseSchema: GemmaJsonSchema,
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
        responseSchema,
        abortSignal: controller.signal,
      },
    });
    return response.text ?? '';
  } finally {
    clearTimeout(timer);
  }
}

export function generateMoveJson(systemInstruction: string, userPrompt: string): Promise<string> {
  return generateJson(systemInstruction, userPrompt, MOVE_SCHEMA as GemmaJsonSchema);
}

export function generateCoachFeedbackJson(
  systemInstruction: string,
  userPrompt: string,
): Promise<string> {
  return generateJson(systemInstruction, userPrompt, COACH_FEEDBACK_SCHEMA as GemmaJsonSchema);
}

export function generateCoachHintJson(
  systemInstruction: string,
  userPrompt: string,
): Promise<string> {
  return generateJson(systemInstruction, userPrompt, COACH_HINT_SCHEMA as GemmaJsonSchema);
}

export function generateCoachOpeningJson(
  systemInstruction: string,
  userPrompt: string,
): Promise<string> {
  return generateJson(systemInstruction, userPrompt, COACH_OPENING_SCHEMA as GemmaJsonSchema);
}
