import { describe, expect, it } from 'vitest';
import { LLM_UNCONFIGURED, assertLlmConfigured, streamTextNotImplemented } from './errors.js';

describe('assertLlmConfigured', () => {
  it('does nothing when a key is present', () => {
    expect(() => assertLlmConfigured(true)).not.toThrow();
  });

  it('throws llm_unconfigured when no key', () => {
    expect(() => assertLlmConfigured(false)).toThrow(LLM_UNCONFIGURED);
  });
});

describe('streamTextNotImplemented', () => {
  it('throws when iteration starts', async () => {
    await expect(async () => {
      for await (const _ of streamTextNotImplemented()) {
        /* empty */
      }
    }).rejects.toThrow('llm_stream_not_implemented');
  });
});
