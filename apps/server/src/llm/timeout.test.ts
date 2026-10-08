import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llmAbortSignal } from './timeout.js';

describe('llmAbortSignal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.LLM_TIMEOUT_MS = '1000';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts after the configured timeout', () => {
    const signal = llmAbortSignal();
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(signal.aborted).toBe(true);
  });

  it('aborts when the parent signal aborts', () => {
    const parent = new AbortController();
    const signal = llmAbortSignal(parent.signal);
    parent.abort();
    expect(signal.aborted).toBe(true);
  });
});
