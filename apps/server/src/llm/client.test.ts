import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmProviderId } from './types.js';
import {
  getLlmProvider,
  getLlmProviderFor,
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

vi.mock('./providers/index.js', () => ({
  createProvider: (id: LlmProviderId, model: string) => ({
    id,
    model,
    generateJson,
    streamText,
  }),
}));

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

  it('caches separate providers per provider:model key', () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'gemini-key';
    const flash = getLlmProviderFor({ provider: 'gemini', model: 'gemini-2.0-flash' });
    const gemma = getLlmProviderFor({ provider: 'gemini', model: 'gemma-4-26b-a4b-it' });
    expect(flash.model).toBe('gemini-2.0-flash');
    expect(gemma.model).toBe('gemma-4-26b-a4b-it');
    expect(flash).not.toBe(gemma);
    expect(getLlmProviderFor({ provider: 'gemini', model: 'gemini-2.0-flash' })).toBe(flash);
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
