import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenaiProvider } from './openai.js';

const envSnapshot = { ...process.env };

const createMock = vi.fn();
const streamMock = vi.fn();

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: createMock,
      },
    };
    constructor() {}
  },
}));

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'sk-test';
  createMock.mockReset();
  streamMock.mockReset();
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

describe('createOpenaiProvider streamText', () => {
  it('yields streamed deltas in order', async () => {
    createMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'Hel' } }] };
        yield { choices: [{ delta: { content: 'lo' } }] };
        yield {
          choices: [{ delta: {} }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        };
      },
    });

    const provider = createOpenaiProvider('gpt-4o-mini');
    const chunks: string[] = [];
    for await (const chunk of provider.streamText({ system: 's', user: 'u' })) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['Hel', 'lo']);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o-mini', stream: true }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
