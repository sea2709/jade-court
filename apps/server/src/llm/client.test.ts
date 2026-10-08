import { afterEach, describe, expect, it } from 'vitest';
import { getLlmProvider, resetLlmProviderCache } from './client.js';

const envSnapshot = { ...process.env };

afterEach(() => {
  resetLlmProviderCache();
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
    expect(second).not.toBe(first);
  });
});
