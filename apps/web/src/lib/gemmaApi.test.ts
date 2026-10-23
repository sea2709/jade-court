import { X } from '@jade-court/xiangqi-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAiMove,
  fetchCoachAsk,
  fetchCoachFeedback,
  fetchCoachHint,
  fetchCoachOpening,
  fetchOpponentMove,
  GemmaApiError,
  isAuthRequired,
  isLlmUnconfigured,
  isPlayAccessRequired,
} from './gemmaApi';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const sentBody = (i = 0) => JSON.parse(fetchMock.mock.calls[i]![1]!.body as string);

describe('gating error helpers', () => {
  it('detects access_required and auth errors', () => {
    expect(isPlayAccessRequired(new GemmaApiError('x', 402, 'access_required'))).toBe(true);
    expect(isPlayAccessRequired(new GemmaApiError('x', 401, 'access_required'))).toBe(false);
    expect(isAuthRequired(new GemmaApiError('x', 401, 'auth_required'))).toBe(true);
    expect(isAuthRequired(new GemmaApiError('x', 402, 'auth_required'))).toBe(false);
  });
});

describe('isLlmUnconfigured', () => {
  it('matches only 503 llm_unconfigured API errors', () => {
    expect(isLlmUnconfigured(new GemmaApiError('x', 503, 'llm_unconfigured'))).toBe(true);
    expect(isLlmUnconfigured(new GemmaApiError('x', 503, 'other'))).toBe(false);
    expect(isLlmUnconfigured(new GemmaApiError('x', 500, 'llm_unconfigured'))).toBe(false);
    expect(isLlmUnconfigured(new Error('llm_unconfigured'))).toBe(false);
  });
});

describe('move requests', () => {
  const params = { board: X.initialBoard(), side: 'b' as const, difficulty: 'beginner' as const };

  it('fetchAiMove includes modelId when provided', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [0, 1], to: [2, 2] }, source: 'llm' }));
    await fetchAiMove({ ...params, modelId: 'gemini-flash' });
    expect(sentBody().modelId).toBe('gemini-flash');
  });

  it('fetchAiMove omits modelId when not provided', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [0, 1], to: [2, 2] }, source: 'llm' }));
    await fetchAiMove(params);
    expect(sentBody()).not.toHaveProperty('modelId');
  });

  it('fetchAiMove posts to /api/ai/move and omits empty history', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [0, 1], to: [2, 2] }, source: 'llm' }));
    await fetchAiMove({ ...params, history: [], lastMove: null });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/ai/move');
    const body = sentBody();
    expect(body).not.toHaveProperty('history');
    expect(body).not.toHaveProperty('lastMove');
    expect(body.side).toBe('b');
  });

  it('fetchOpponentMove posts to /api/opponent/move with lastMove and history', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [0, 1], to: [2, 2] }, source: 'engine' }));
    const lastMove = { from: [7, 1] as [number, number], to: [7, 4] as [number, number] };
    await fetchOpponentMove({ ...params, lastMove, history: [{ side: 'r', ...lastMove }] });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/opponent/move');
    expect(sentBody()).toMatchObject({ lastMove, history: [{ side: 'r' }] });
  });

  it('throws GemmaApiError with status and code', async () => {
    fetchMock.mockResolvedValue(json({ error: 'llm_unconfigured' }, 503));
    const err = await fetchAiMove(params).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GemmaApiError);
    expect(isLlmUnconfigured(err)).toBe(true);
  });
});

describe('coach requests', () => {
  const board = X.initialBoard();
  const move = { from: [7, 1] as [number, number], to: [7, 4] as [number, number] };

  it('batch coach calls include modelId when provided', async () => {
    fetchMock.mockResolvedValue(json({ text: 'x', source: 'llm' }));
    await fetchCoachOpening({ difficulty: 'beginner', modelId: 'm-open' });
    expect(sentBody(0).modelId).toBe('m-open');

    fetchMock.mockResolvedValue(json({ desc: 'd', body: 'b', source: 'llm' }));
    await fetchCoachFeedback({
      boardBefore: board,
      move,
      side: 'r',
      modelId: 'm-fb',
    });
    expect(sentBody(1).modelId).toBe('m-fb');

    fetchMock.mockResolvedValue(json({ text: 'hint', move, source: 'llm' }));
    await fetchCoachHint({ board, side: 'r', modelId: 'm-hint' });
    expect(sentBody(2).modelId).toBe('m-hint');

    fetchMock.mockResolvedValue(json({ text: 'Answer', source: 'llm' }));
    await fetchCoachAsk({ board, side: 'r', question: 'Why?', modelId: 'm-ask' });
    expect(sentBody(3).modelId).toBe('m-ask');
  });

  it('fetchCoachAsk sends the question', async () => {
    fetchMock.mockResolvedValue(json({ text: 'Answer', source: 'llm' }));
    await expect(
      fetchCoachAsk({ board: X.initialBoard(), side: 'r', question: 'Why?' }),
    ).resolves.toEqual({ text: 'Answer', source: 'llm' });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/coach/ask');
    expect(sentBody().question).toBe('Why?');
  });
});
