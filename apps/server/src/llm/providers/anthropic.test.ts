import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnthropicProvider } from './anthropic.js';

const envSnapshot = { ...process.env };

const streamEvents = vi.fn();
const finalMessage = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = {
      stream: streamEvents,
    };
    constructor() {}
  },
}));

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  streamEvents.mockReset();
  finalMessage.mockReset();
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.clearAllMocks();
});

describe('createAnthropicProvider streamText', () => {
  it('yields text deltas from the message stream', async () => {
    streamEvents.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hi' },
        };
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: '!' },
        };
      },
      finalMessage: finalMessage.mockResolvedValue({
        usage: { input_tokens: 1, output_tokens: 2 },
        content: [],
      }),
    });

    const provider = createAnthropicProvider('claude-3-5-haiku-20241022');
    const chunks: string[] = [];
    for await (const chunk of provider.streamText({ system: 's', user: 'u' })) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['Hi', '!']);
    expect(streamEvents).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-3-5-haiku-20241022' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
