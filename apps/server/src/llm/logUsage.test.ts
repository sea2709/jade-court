import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logLlmTokenUsage } from './logUsage.js';

const envSnapshot = { ...process.env };

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('logLlmTokenUsage', () => {
  it('no-ops when logging is disabled', () => {
    process.env.LLM_LOG_TOKENS = '0';
    process.env.NODE_ENV = 'test';
    logLlmTokenUsage('gemini', { promptTokens: 1, outputTokens: 2 });
    expect(console.log).not.toHaveBeenCalled();
  });

  it('warns when usage is missing', () => {
    process.env.LLM_LOG_TOKENS = '1';
    logLlmTokenUsage('openai', undefined);
    expect(console.warn).toHaveBeenCalledWith('[llm] tokens: usage missing from API response');
  });

  it('logs normalized counts when enabled', () => {
    process.env.LLM_LOG_TOKENS = '1';
    process.env.LLM_PROVIDER = 'anthropic';
    logLlmTokenUsage('anthropic', { promptTokens: 10, outputTokens: 5, totalTokens: 15 });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/prompt=10 output=5 total=15 provider=anthropic/),
    );
  });
});
