import { getGuestId } from './guestId';
import { GemmaApiError } from './gemmaApi';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface CoachStreamMeta {
  verdict?: string;
  label?: string;
  emoji?: string;
  tone?: string;
  lossCp?: number;
  move?: { from: [number, number]; to: [number, number] };
}

export interface CoachStreamHandlers {
  onMeta?: (meta: CoachStreamMeta) => void;
  onToken?: (text: string) => void;
  onDone?: (source: 'llm' | 'template') => void;
  onError?: (code: string) => void;
}

type SsePayload =
  | ({ type: 'meta' } & CoachStreamMeta)
  | { type: 'token'; text: string }
  | { type: 'done'; source: 'llm' | 'template' }
  | { type: 'error'; code: string };

export async function streamCoachPost(
  path: string,
  body: unknown,
  handlers: CoachStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-guest-id': getGuestId(),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new GemmaApiError(data.error ?? res.statusText, res.status, data.error);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('stream_unavailable');

  const dec = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        try {
          const ev = JSON.parse(raw) as SsePayload;
          if (ev.type === 'meta') handlers.onMeta?.(ev);
          else if (ev.type === 'token') handlers.onToken?.(ev.text);
          else if (ev.type === 'done') handlers.onDone?.(ev.source);
          else if (ev.type === 'error') handlers.onError?.(ev.code);
        } catch {
          /* skip malformed chunk */
        }
      }
    }
  }
}
