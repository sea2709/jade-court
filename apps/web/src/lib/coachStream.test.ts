import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamCoachPost } from './coachStream';
import { GemmaApiError } from './gemmaApi';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

/** Build an SSE response whose body arrives in the given raw chunks. */
function sseResponse(chunks: string[]) {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

const ev = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

describe('streamCoachPost', () => {
  it('dispatches meta, token, and done events', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        ev({ type: 'meta', verdict: 'great', label: 'Great move!' }),
        ev({ type: 'token', text: 'Nice ' }),
        ev({ type: 'token', text: 'move.' }),
        ev({ type: 'done', source: 'llm' }),
      ]),
    );
    const handlers = { onMeta: vi.fn(), onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    await streamCoachPost('/api/coach/feedback/stream', { a: 1 }, handlers);

    expect(handlers.onMeta).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: 'great', label: 'Great move!' }),
    );
    expect(handlers.onToken.mock.calls.map((c) => c[0])).toEqual(['Nice ', 'move.']);
    expect(handlers.onDone).toHaveBeenCalledWith('llm');
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ a: 1 });
  });

  it('reassembles events split across chunk boundaries', async () => {
    const full =
      ev({ type: 'token', text: 'split across chunks' }) + ev({ type: 'done', source: 'template' });
    fetchMock.mockResolvedValue(sseResponse([full.slice(0, 7), full.slice(7, 30), full.slice(30)]));
    const onToken = vi.fn();
    const onDone = vi.fn();
    await streamCoachPost('/x', {}, { onToken, onDone });
    expect(onToken).toHaveBeenCalledExactlyOnceWith('split across chunks');
    expect(onDone).toHaveBeenCalledWith('template');
  });

  it('skips malformed data lines and reports error events', async () => {
    fetchMock.mockResolvedValue(
      sseResponse(['data: {not json}\n\n', ev({ type: 'error', code: 'upstream_down' })]),
    );
    const onError = vi.fn();
    await streamCoachPost('/x', {}, { onError });
    expect(onError).toHaveBeenCalledExactlyOnceWith('upstream_down');
  });

  it('throws GemmaApiError with the server code on HTTP errors', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), { status: 429 }),
    );
    const err = await streamCoachPost('/x', {}, {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GemmaApiError);
    expect(err).toMatchObject({ status: 429, code: 'rate_limit_exceeded' });
  });
});
