import { afterEach, describe, expect, it } from 'vitest';
import {
  AI_MODEL_PRESETS,
  defaultPresetId,
  findPresetById,
  listAvailablePresets,
} from './presets.js';

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

describe('AI model presets', () => {
  it('filters presets to providers with API keys', () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';
    const available = listAvailablePresets();
    expect(available.every((p) => p.provider === 'openai')).toBe(true);
    expect(available.some((p) => p.id === 'gpt-4o-mini')).toBe(true);
    expect(available.some((p) => p.id === 'gemini-flash')).toBe(false);
  });

  it('defaultPresetId matches env provider and model when configured', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_MODEL = 'gpt-4o-mini';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(defaultPresetId()).toBe('gpt-4o-mini');
  });

  it('findPresetById returns catalog entries', () => {
    expect(findPresetById('gemini-flash')?.model).toBe('gemini-2.0-flash');
    expect(AI_MODEL_PRESETS.length).toBe(5);
  });

  it('defaultPresetId is null when no provider keys are configured', () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(listAvailablePresets()).toEqual([]);
    expect(defaultPresetId()).toBeNull();
  });

  it('defaultPresetId is always an available preset id', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.LLM_PROVIDER = 'gemini';
    const id = defaultPresetId();
    expect(id).toBe('gpt-4o-mini');
    expect(listAvailablePresets().some((p) => p.id === id)).toBe(true);
  });
});
