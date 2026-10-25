/**
 * Limits for active game saves (plies and coach chat).
 */
import type { SavedChatMessage } from './types.js';

export const MAX_SAVE_PLIES = 400;
/** Reject request bodies with more plies before per-element validation (DoS guard). */
export const MAX_MOVES_REQUEST_LENGTH = 500;
export const MAX_CHAT_MESSAGES = 60;
export const MAX_CHAT_TEXT_CHARS = 1000;

/** Keep the last messages and truncate each `text` field. */
export function capChat(messages: SavedChatMessage[]): SavedChatMessage[] {
  const tail = messages.length > MAX_CHAT_MESSAGES ? messages.slice(-MAX_CHAT_MESSAGES) : messages;
  return tail.map((m) => ({
    ...m,
    text: m.text.length > MAX_CHAT_TEXT_CHARS ? m.text.slice(0, MAX_CHAT_TEXT_CHARS) : m.text,
  }));
}
