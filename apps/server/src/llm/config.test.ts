import { afterEach, describe, expect, it } from 'vitest';
import {
  apiKeyForProvider,
  defaultModelForProvider,
  isLlmConfigured,
  llmHistoryLimit,
  llmModel,
  llmProviderId,
  llmTimeoutMs,
  shouldLogLlmTokenUsage,
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
    expect(llmProviderId()).toBe('gemini');
  });

  it('parses LLM_PROVIDER', () => {
    process.env.LLM_PROVIDER = 'openai';
    expect(llmProviderId()).toBe('openai');
  });

  it('isLlmConfigured checks active provider key', () => {
    process.env.LLM_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    expect(isLlmConfigured()).toBe(false);
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(isLlmConfigured()).toBe(true);
  });

  it('llmModel prefers LLM_MODEL then provider default', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    delete process.env.LLM_MODEL;
    expect(llmModel()).toBe(defaultModelForProvider('anthropic'));
    process.env.LLM_MODEL = 'claude-custom';
    expect(llmModel()).toBe('claude-custom');
  });

  it('timeout and history use LLM_* or defaults', () => {
    delete process.env.LLM_TIMEOUT_MS;
    expect(llmTimeoutMs()).toBe(25000);
    process.env.LLM_TIMEOUT_MS = '12000';
    expect(llmTimeoutMs()).toBe(12000);
    delete process.env.LLM_HISTORY_LIMIT;
    expect(llmHistoryLimit()).toBe(150);
    process.env.LLM_HISTORY_LIMIT = '80';
    expect(llmHistoryLimit()).toBe(80);
  });

  it('apiKeyForProvider reads correct env var', () => {
    process.env.GEMINI_API_KEY = 'g';
    process.env.OPENAI_API_KEY = 'o';
    process.env.ANTHROPIC_API_KEY = 'a';
    expect(apiKeyForProvider('gemini')).toBe('g');
    expect(apiKeyForProvider('openai')).toBe('o');
    expect(apiKeyForProvider('anthropic')).toBe('a');
  });

  it('shouldLogLlmTokenUsage respects LLM_LOG_TOKENS and NODE_ENV', () => {
    delete process.env.LLM_LOG_TOKENS;
    process.env.NODE_ENV = 'development';
    expect(shouldLogLlmTokenUsage()).toBe(true);

    process.env.LLM_LOG_TOKENS = '0';
    expect(shouldLogLlmTokenUsage()).toBe(false);

    process.env.LLM_LOG_TOKENS = '1';
    process.env.NODE_ENV = 'test';
    expect(shouldLogLlmTokenUsage()).toBe(true);
  });
});
