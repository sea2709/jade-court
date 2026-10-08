import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmProviderId } from './types.js';
import {
  getLlmProvider,
  llmGenerateCoachAskJson,
  llmGenerateCoachFeedbackJson,
  llmGenerateCoachHintJson,
  llmGenerateCoachOpeningJson,
  llmGenerateMoveJson,
  llmStreamCoachText,
  resetLlmProviderCache,
} from './client.js';

const { generateJson, streamText } = vi.hoisted(() => ({
  generateJson: vi.fn().mockResolvedValue('{"move":{"from":[7,1],"to":[7,4]}}'),
  streamText: vi.fn(async function* () {
    yield 'coach chunk';
  }),
}));

vi.mock('./providers/index.js', async () => {
  const config = await import('./config.js');
  return {
    createProvider: (id: LlmProviderId) => ({
      id,
      model: config.llmModel(id),
      generateJson,
      streamText,
    }),
  };
});

const envSnapshot = { ...process.env };

afterEach(() => {
  resetLlmProviderCache();
  generateJson.mockClear();
  streamText.mockClear();
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('getLlmProvider', () => {
  it('recreates provider when LLM_PROVIDER changes', () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'gemini-key';
    delete process.env.OPENAI_API_KEY;
    const gemini = getLlmProvider();
    expect(gemini.id).toBe('gemini');

    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'openai-key';
    const openai = getLlmProvider();
    expect(openai.id).toBe('openai');
    expect(openai).not.toBe(gemini);
  });

  it('recreates provider when LLM_MODEL changes for the same provider', () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'gemini-key';
    process.env.LLM_MODEL = 'gemini-model-a';
    const first = getLlmProvider();
    expect(first.model).toBe('gemini-model-a');

    process.env.LLM_MODEL = 'gemini-model-b';
    const second = getLlmProvider();
    expect(second.model).toBe('gemini-model-b');
    expect(second.id).toBe('gemini');
    expect(second).not.toBe(first);
  });
});

describe('LLM JSON and stream helpers', () => {
  beforeEach(() => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'gemini-key';
    resetLlmProviderCache();
  });

  it('delegates generateJson with the move schema', async () => {
    await llmGenerateMoveJson('sys', 'user');
    expect(generateJson).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'sys', user: 'user', schema: expect.any(Object) }),
    );
  });

  it('delegates generateJson for coach endpoints', async () => {
    await llmGenerateCoachFeedbackJson('f', 'u');
    await llmGenerateCoachHintJson('h', 'u');
    await llmGenerateCoachOpeningJson('o', 'u');
    await llmGenerateCoachAskJson('a', 'u');
    expect(generateJson).toHaveBeenCalledTimes(4);
  });

  it('streams coach text from the provider', async () => {
    const chunks: string[] = [];
    for await (const chunk of llmStreamCoachText('sys', 'user')) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['coach chunk']);
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'sys', user: 'user' }),
    );
  });
});
