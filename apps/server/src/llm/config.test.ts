import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  apiKeyForProvider,
  defaultModelForProvider,
  isLlmConfigured,
  llmHistoryLimit,
  llmModel,
  llmProviderId,
  llmTimeoutMs,
} from './config.js';

const envSnapshot = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('llm config', () => {
  it('defaults provider to gemini', () => {
    delete process.env.LLM_PROVIDER;
    assert.equal(llmProviderId(), 'gemini');
  });

  it('parses LLM_PROVIDER', () => {
    process.env.LLM_PROVIDER = 'openai';
    assert.equal(llmProviderId(), 'openai');
  });

  it('isLlmConfigured checks active provider key', () => {
    process.env.LLM_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    assert.equal(isLlmConfigured(), false);
    process.env.OPENAI_API_KEY = 'sk-test';
    assert.equal(isLlmConfigured(), true);
  });

  it('llmModel prefers LLM_MODEL then provider default', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    delete process.env.LLM_MODEL;
    assert.equal(llmModel(), defaultModelForProvider('anthropic'));
    process.env.LLM_MODEL = 'claude-custom';
    assert.equal(llmModel(), 'claude-custom');
  });

  it('timeout and history use LLM_* or defaults', () => {
    delete process.env.LLM_TIMEOUT_MS;
    assert.equal(llmTimeoutMs(), 25000);
    process.env.LLM_TIMEOUT_MS = '12000';
    assert.equal(llmTimeoutMs(), 12000);
    delete process.env.LLM_HISTORY_LIMIT;
    assert.equal(llmHistoryLimit(), 150);
    process.env.LLM_HISTORY_LIMIT = '80';
    assert.equal(llmHistoryLimit(), 80);
  });

  it('apiKeyForProvider reads correct env var', () => {
    process.env.GEMINI_API_KEY = 'g';
    process.env.OPENAI_API_KEY = 'o';
    process.env.ANTHROPIC_API_KEY = 'a';
    assert.equal(apiKeyForProvider('gemini'), 'g');
    assert.equal(apiKeyForProvider('openai'), 'o');
    assert.equal(apiKeyForProvider('anthropic'), 'a');
  });
});
