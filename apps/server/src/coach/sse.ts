/**
 * SSE helpers for coach streaming routes.
 */

export type CoachSseEvent =
  | {
      type: 'meta';
      verdict?: string;
      label?: string;
      emoji?: string;
      tone?: string;
      lossCp?: number;
      move?: { from: [number, number]; to: [number, number] };
    }
  | { type: 'token'; text: string }
  | { type: 'done'; source: 'llm' | 'template' }
  | { type: 'error'; code: string };

export function coachSseResponse(
  run: (send: (event: CoachSseEvent) => void) => Promise<void>,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: CoachSseEvent) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await run(send);
      } catch (err) {
        const code = err instanceof Error ? err.message : 'stream_failed';
        send({ type: 'error', code });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
