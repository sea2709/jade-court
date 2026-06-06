export interface ChatMessage {
  id: number;
  from: 'coach' | 'player' | 'system';
  text: string;
  verdict?: string;
  label?: string;
  emoji?: string;
  tone?: string;
  lossCp?: number;
  sub?: string;
  think?: boolean;
}

export type ChatMessagePatch = Partial<Omit<ChatMessage, 'id' | 'from'>>;

export const TONE_CLASS: Record<string, string> = {
  great: 'text-good',
  good: 'text-good',
  ok: 'text-ink-soft',
  warn: 'text-warn',
  bad: 'text-bad',
  info: 'text-jade-deep',
  sys: 'text-muted',
};
