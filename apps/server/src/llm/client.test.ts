import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
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
    assert.equal(gemini.id, 'gemini');

    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'openai-key';
    const openai = getLlmProvider();
    assert.equal(openai.id, 'openai');
    assert.notEqual(openai, gemini);
  });

  it('recreates provider when LLM_MODEL changes for the same provider', () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'gemini-key';
    process.env.LLM_MODEL = 'gemini-model-a';
    const first = getLlmProvider();
    assert.equal(first.model, 'gemini-model-a');

    process.env.LLM_MODEL = 'gemini-model-b';
    const second = getLlmProvider();
    assert.equal(second.model, 'gemini-model-b');
    assert.notEqual(second, first);
  });
});
