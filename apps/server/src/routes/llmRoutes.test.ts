import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Coach, X } from '@jade-court/xiangqi-engine';
import { createApp } from '../app.js';
import { SESSION_COOKIE_NAME } from '../auth/config.js';
import type * as LlmClient from '../llm/client.js';
import type { LlmCallOptions } from '../llm/client.js';
import { resetRateLimitsForTests } from '../llm/rateLimit.js';
import { MemorySessionStore } from '../users/memorySessionStore.js';
import { MemoryUserStore } from '../users/memoryStore.js';
import { hashPassword } from '../users/password.js';

type LlmFn = (system: string, user: string, options?: LlmCallOptions) => Promise<string>;

const llm = vi.hoisted(() => ({
  configured: true,
  move: vi.fn<LlmFn>(),
  feedback: vi.fn<LlmFn>(),
  hint: vi.fn<LlmFn>(),
  opening: vi.fn<LlmFn>(),
  ask: vi.fn<LlmFn>(),
  stream:
    vi.fn<
      (
        system: string,
        user: string,
        options?: LlmCallOptions & { signal?: AbortSignal },
      ) => AsyncGenerator<string>
    >(),
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

const SESSION_SECRET = 'test-session-secret-0123456789abcdef0123456789ab';

let app: ReturnType<typeof createApp>;
let userStore: MemoryUserStore;
let sessionCookie = '';
let guestSeq = 0;

function cookieFromResponse(res: Response): string | undefined {
  const raw = res.headers.get('set-cookie');
  if (!raw) return undefined;
  const re = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`);
  return raw.match(re)?.[1];
}

async function ensureSignedInWithPass() {
  const email = `llm-player-${++guestSeq}@example.com`;
  const hash = await hashPassword('password123');
  const user = await userStore.create({ email, passwordHash: hash });
  await userStore.extendAccess(user.id, 48 * 3600_000, new Date());
  const login = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const token = cookieFromResponse(login);
  if (!token) throw new Error('login failed');
  sessionCookie = token;
}

beforeEach(async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.NODE_ENV = 'test';
  resetRateLimitsForTests();
  userStore = new MemoryUserStore();
  app = createApp({ newsStore: null, userStore, sessionStore: new MemorySessionStore() });
  llm.configured = true;
  await ensureSignedInWithPass();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
  delete process.env.NODE_ENV;
  resetRateLimitsForTests();
  vi.restoreAllMocks();
  for (const fn of [llm.move, llm.feedback, llm.hint, llm.opening, llm.ask, llm.stream]) {
    fn.mockReset();
  }
});

/** Authenticated request with active day pass; fresh guest id per call unless overridden. */
function post(path: string, body?: unknown, guestId = `llm-guest-${++guestSeq}`) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-guest-id': guestId,
      Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
    },
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
  it('rejects malformed JSON when signed in with pass', async () => {
    const res = await post('/api/coach/feedback', '{oops');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_json' });
  });

  it('returns 401 before body validation for guests', async () => {
    const res = await app.request('/api/coach/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-guest-id': 'anon' },
      body: '{oops',
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'auth_required' });
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

  it('rate limits per user after 30 requests', async () => {
    llm.configured = false;
    const guestA = 'llm-rate-guest-a';
    const guestB = 'llm-rate-guest-b';
    for (let i = 0; i < 30; i++) {
      expect((await post('/api/coach/opening', {}, guestA)).status).toBe(503);
    }
    const res = await post('/api/coach/opening', {}, guestB);
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

describe('AI model presets', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'gemini-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.LLM_PROVIDER = 'gemini';
    delete process.env.LLM_MODEL;
  });

  it('GET /api/ai/models is readable without play access', async () => {
    const res = await app.request('/api/ai/models', { headers: { 'x-guest-id': 'paywall-guest' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.defaultId).toBeTypeOf('string');
    expect(data.models.length).toBeGreaterThan(0);
    expect(data.models[0]).toMatchObject({ id: expect.any(String), label: expect.any(String) });
    expect(data.models[0]).not.toHaveProperty('provider');
  });

  it('returns invalid_model for unknown modelId', async () => {
    const res = await post('/api/coach/opening', { modelId: 'not-a-real-preset' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_model' });
  });

  it('returns invalid_model for non-string modelId', async () => {
    const res = await post('/api/coach/opening', { modelId: 123 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_model' });
  });

  it('GET /api/ai/models returns null defaultId when no presets are available', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const res = await app.request('/api/ai/models', { headers: { 'x-guest-id': 'empty-models' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.models).toEqual([]);
    expect(data.defaultId).toBeNull();
  });

  it('ai/move honors cross-provider preset when env default provider has no key', async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.LLM_PROVIDER = 'gemini';
    llm.configured = false;
    llm.move.mockResolvedValue(JSON.stringify({ moveIndex: 1, comment: 'OpenAI move.' }));
    const res = await post('/api/ai/move', { ...moveBody, modelId: 'gpt-4o-mini' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ source: 'llm', comment: 'OpenAI move.' });
    expect(llm.move).toHaveBeenCalled();
  });

  it('forwards modelId to batch coach and move handlers', async () => {
    llm.opening.mockResolvedValue(JSON.stringify({ text: 'Welcome' }));
    llm.move.mockResolvedValue(JSON.stringify({ moveIndex: 1 }));
    await post('/api/coach/opening', { modelId: 'gpt-4o-mini' });
    expect(llm.opening).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        selection: { provider: 'openai', model: 'gpt-4o-mini', presetId: 'gpt-4o-mini' },
      }),
    );

    await post('/api/ai/move', { ...moveBody, modelId: 'gemini-flash' });
    expect(llm.move).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        selection: {
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          presetId: 'gemini-flash',
        },
      }),
    );
  });

  it('forwards modelId to stream coach handlers', async () => {
    llm.stream.mockImplementation(async function* () {
      yield 'streamed';
    });
    await post('/api/coach/ask/stream', { ...askBody, modelId: 'claude-haiku' });
    expect(llm.stream).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        selection: {
          provider: 'anthropic',
          model: 'claude-3-5-haiku-20241022',
          presetId: 'claude-haiku',
        },
      }),
    );
  });

  it('persists preferredModelId for signed-in players', async () => {
    llm.opening.mockResolvedValue(JSON.stringify({ text: 'Hi' }));
    await post('/api/coach/opening', { modelId: 'gemini-flash' });
    const saved = userStore.all().find((u) => u.preferredModelId === 'gemini-flash');
    expect(saved).toBeDefined();
  });
});
