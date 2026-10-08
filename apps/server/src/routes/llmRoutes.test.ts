import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Coach, X } from '@jade-court/xiangqi-engine';
import { createApp } from '../app.js';
import type * as LlmClient from '../llm/client.js';

const llm = vi.hoisted(() => ({
  configured: true,
  move: vi.fn<(system: string, user: string) => Promise<string>>(),
  feedback: vi.fn<(system: string, user: string) => Promise<string>>(),
  hint: vi.fn<(system: string, user: string) => Promise<string>>(),
  opening: vi.fn<(system: string, user: string) => Promise<string>>(),
  ask: vi.fn<(system: string, user: string) => Promise<string>>(),
  stream: vi.fn<(system: string, user: string) => AsyncGenerator<string>>(),
}));

vi.mock('../llm/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof LlmClient>();
  return {
    ...actual,
    isLlmConfigured: () => llm.configured,
    llmHistoryLimit: () => 150,
    llmGenerateMoveJson: llm.move,
    llmGenerateCoachFeedbackJson: llm.feedback,
    llmGenerateCoachHintJson: llm.hint,
    llmGenerateCoachOpeningJson: llm.opening,
    llmGenerateCoachAskJson: llm.ask,
    llmStreamCoachText: llm.stream,
  };
});

const app = createApp();
let guestSeq = 0;

beforeEach(() => {
  llm.configured = true;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const fn of [llm.move, llm.feedback, llm.hint, llm.opening, llm.ask, llm.stream]) {
    fn.mockReset();
  }
});

/** Each request uses a fresh guest id so the per-guest rate limit never interferes. */
function post(path: string, body?: unknown, guestId = `llm-guest-${++guestSeq}`) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-guest-id': guestId },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  });
}

/** Parse an SSE body into its JSON `data:` events. */
async function sseEvents(res: Response) {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)) as Record<string, unknown>);
}

const board = X.initialBoard();
const feedbackBody = {
  boardBefore: board,
  move: { from: [7, 1], to: [7, 4] },
  side: 'r',
  depth: 1,
};
const hintBody = { board, side: 'r', depth: 1 };
const askBody = { board, side: 'r', question: 'What should I do?' };
const moveBody = { board, side: 'b', difficulty: 'beginner' };

describe('LLM routes when the LLM is not configured', () => {
  beforeEach(() => {
    llm.configured = false;
  });

  it.each([
    ['/api/coach/feedback', feedbackBody],
    ['/api/coach/hint', hintBody],
    ['/api/coach/opening', {}],
    ['/api/coach/ask', askBody],
    ['/api/ai/move', moveBody],
  ])('%s returns 503 llm_unconfigured', async (path, body) => {
    const res = await post(path, body);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'llm_unconfigured' });
  });

  it('streams template text for /api/coach/ask/stream', async () => {
    const res = await post('/api/coach/ask/stream', askBody);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(await sseEvents(res)).toEqual([
      { type: 'token', text: Coach.askReply() },
      { type: 'done', source: 'template' },
    ]);
  });
});

describe('request validation', () => {
  it('rejects malformed JSON', async () => {
    const res = await post('/api/coach/feedback', '{oops');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_json' });
  });

  it.each([
    ['/api/coach/feedback', { ...feedbackBody, move: { from: [7, 1] } }],
    ['/api/coach/feedback', { ...feedbackBody, side: 'x' }],
    ['/api/coach/hint', { ...hintBody, board: [] }],
    ['/api/coach/ask', { ...askBody, question: '   ' }],
    ['/api/coach/ask/stream', { ...askBody, question: 42 }],
    ['/api/ai/move', { ...moveBody, difficulty: 'impossible' }],
  ])('%s rejects an invalid body', async (path, body) => {
    const res = await post(path, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_request' });
  });

  it('rate limits a guest after 30 requests', async () => {
    llm.configured = false;
    const guest = 'llm-rate-limited';
    for (let i = 0; i < 30; i++) {
      expect((await post('/api/coach/opening', {}, guest)).status).toBe(503);
    }
    const res = await post('/api/coach/opening', {}, guest);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limit_exceeded' });
  });
});

describe('LLM routes with a mocked model', () => {
  it('feedback uses the engine verdict with LLM copy', async () => {
    llm.feedback.mockResolvedValue(JSON.stringify({ desc: 'Central cannon.', body: 'Classic.' }));
    const res = await post('/api/coach/feedback', feedbackBody);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ desc: 'Central cannon.', body: 'Classic.', source: 'llm' });
    expect(data.verdict).toBeTypeOf('string');
  });

  it('feedback falls back to template copy when the model errors', async () => {
    llm.feedback.mockRejectedValue(new Error('timeout'));
    const res = await post('/api/coach/feedback', feedbackBody);
    expect(await res.json()).toMatchObject({ source: 'template', desc: 'Cannon advances.' });
  });

  it('hint returns the engine move with LLM text', async () => {
    llm.hint.mockResolvedValue(JSON.stringify({ text: 'Develop.', tip: 'Horses first.' }));
    const res = await post('/api/coach/hint', hintBody);
    const data = await res.json();
    expect(data).toMatchObject({ text: 'Develop.', tip: 'Horses first.', source: 'llm' });
    expect(X.legalMoves(board, 'r')).toContainEqual(expect.objectContaining(data.move));
  });

  it('hint falls back to template on invalid JSON', async () => {
    llm.hint.mockResolvedValue('not json');
    const data = await (await post('/api/coach/hint', hintBody)).json();
    expect(data.source).toBe('template');
  });

  it('opening returns LLM text, or the template on bad output', async () => {
    llm.opening.mockResolvedValueOnce(JSON.stringify({ text: 'Welcome back!' }));
    expect(await (await post('/api/coach/opening', { difficulty: 'beginner' })).json()).toEqual({
      text: 'Welcome back!',
      source: 'llm',
    });

    llm.opening.mockResolvedValueOnce('{}');
    expect(await (await post('/api/coach/opening')).json()).toEqual({
      text: Coach.opening(),
      source: 'template',
    });
  });

  it('ask returns the model answer', async () => {
    llm.ask.mockResolvedValue(JSON.stringify({ text: 'Protect your General.' }));
    expect(await (await post('/api/coach/ask', askBody)).json()).toEqual({
      text: 'Protect your General.',
      source: 'llm',
    });
  });

  it('ask/stream forwards model tokens', async () => {
    llm.stream.mockImplementation(async function* () {
      yield 'Hello';
      yield ' there';
    });
    const events = await sseEvents(await post('/api/coach/ask/stream', askBody));
    expect(events).toEqual([
      { type: 'token', text: 'Hello' },
      { type: 'token', text: ' there' },
      { type: 'done', source: 'llm' },
    ]);
  });

  it('feedback/stream sends verdict meta before tokens', async () => {
    llm.stream.mockImplementation(async function* () {
      yield 'Nice.';
    });
    const events = await sseEvents(await post('/api/coach/feedback/stream', feedbackBody));
    expect(events[0]).toMatchObject({ type: 'meta', verdict: expect.any(String) });
    expect(events.slice(1)).toEqual([
      { type: 'token', text: 'Nice.' },
      { type: 'done', source: 'llm' },
    ]);
  });

  it('streams an error event when the model stream fails', async () => {
    llm.stream.mockImplementation(async function* () {
      yield* [];
      throw new Error('upstream_down');
    });
    const events = await sseEvents(await post('/api/coach/hint/stream', hintBody));
    expect(events[0]).toMatchObject({ type: 'meta', move: expect.any(Object) });
    expect(events.at(-1)).toEqual({ type: 'error', code: 'upstream_down' });
  });

  it('ai/move resolves the model choice to a legal move', async () => {
    llm.move.mockResolvedValue(JSON.stringify({ moveIndex: 1, comment: 'Solid.' }));
    const data = await (await post('/api/ai/move', moveBody)).json();
    expect(data).toMatchObject({ source: 'llm', comment: 'Solid.' });
    expect(data.move).toEqual(X.legalMoves(board, 'b')[0]);
  });

  it('ai/move falls back to negamax on an unusable model reply', async () => {
    llm.move.mockResolvedValue(JSON.stringify({ from: [9, 9], to: [0, 0] }));
    const data = await (await post('/api/ai/move', moveBody)).json();
    expect(data.source).toBe('negamax');
    expect(X.legalMoves(board, 'b')).toContainEqual(data.move);
  });
});
