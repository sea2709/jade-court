import { describe, expect, it } from 'vitest';
import { capChat, MAX_CHAT_MESSAGES, MAX_CHAT_TEXT_CHARS } from './caps.js';

describe('capChat', () => {
  it('truncates message count and text length', () => {
    const messages = Array.from({ length: MAX_CHAT_MESSAGES + 2 }, (_, i) => ({
      id: i,
      from: 'player' as const,
      text: 'x'.repeat(MAX_CHAT_TEXT_CHARS + 10),
    }));
    const capped = capChat(messages);
    expect(capped).toHaveLength(MAX_CHAT_MESSAGES);
    expect(capped[0]!.id).toBe(2);
    expect(capped[0]!.text).toHaveLength(MAX_CHAT_TEXT_CHARS);
  });
});
