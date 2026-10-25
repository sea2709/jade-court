import { afterEach, describe, expect, it } from 'vitest';
import { envDefaultSelection, parseModelIdField, resolveLlmSelection } from './modelSelection.js';

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

describe('resolveLlmSelection', () => {
  it('uses env default when modelId is omitted', () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'key';
    const sel = resolveLlmSelection();
    expect(sel.ok).toBe(true);
    if (sel.ok) {
      expect(sel.selection).toEqual(envDefaultSelection());
      expect(sel.selection.presetId).toBeUndefined();
    }
  });

  it('resolves a configured preset id', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const sel = resolveLlmSelection('gpt-4o-mini');
    expect(sel.ok).toBe(true);
    if (sel.ok) {
      expect(sel.selection).toMatchObject({
        provider: 'openai',
        model: 'gpt-4o-mini',
        presetId: 'gpt-4o-mini',
      });
    }
  });

  it('rejects unknown or unavailable presets', () => {
    expect(resolveLlmSelection('not-a-preset')).toEqual({ ok: false, error: 'invalid_model' });
    delete process.env.OPENAI_API_KEY;
    expect(resolveLlmSelection('gpt-4o-mini')).toEqual({ ok: false, error: 'invalid_model' });
  });
});

describe('parseModelIdField', () => {
  it('omits when modelId key is absent', () => {
    expect(parseModelIdField({})).toEqual({ ok: true, modelId: undefined });
  });

  it('rejects non-string or blank modelId when the key is present', () => {
    expect(parseModelIdField({ modelId: 123 })).toEqual({ ok: false, error: 'invalid_model' });
    expect(parseModelIdField({ modelId: ['gpt-4o-mini'] })).toEqual({
      ok: false,
      error: 'invalid_model',
    });
    expect(parseModelIdField({ modelId: '' })).toEqual({ ok: false, error: 'invalid_model' });
    expect(parseModelIdField({ modelId: '   ' })).toEqual({ ok: false, error: 'invalid_model' });
  });

  it('trims valid string modelId', () => {
    expect(parseModelIdField({ modelId: ' gemini-flash ' })).toEqual({
      ok: true,
      modelId: 'gemini-flash',
    });
  });
});
