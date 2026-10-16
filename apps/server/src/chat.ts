/**
 * In-room chat: validation, capped history, and per-player rate limiting.
 * Player identity in payloads is `side` only — never guest IDs.
 */
import { randomUUID } from 'node:crypto';
import type { Side } from '@jade-court/xiangqi-engine';
import { seatFor, type RoomState } from './rooms.js';

export const CHAT_MAX_TEXT_LENGTH = 500;
export const CHAT_HISTORY_CAP = 100;

export type ChatEntry =
  | { kind: 'message'; id: string; side: Side; text: string; createdAt: number }
  | {
      kind: 'system';
      id: string;
      event: 'joined' | 'resigned' | 'checkmate' | 'stalemate';
      side: Side;
      createdAt: number;
    };

export type ChatRejectReason = 'empty' | 'too_long' | 'rate_limited' | 'not_a_player';

export type ValidateChatTextResult =
  { ok: true; text: string } | { ok: false; error: 'empty' | 'too_long' };

/** Trim input; reject empty/whitespace-only and text over {@link CHAT_MAX_TEXT_LENGTH}. */
export function validateChatText(raw: string): ValidateChatTextResult {
  const text = raw.trim();
  if (text === '') return { ok: false, error: 'empty' };
  if (text.length > CHAT_MAX_TEXT_LENGTH) return { ok: false, error: 'too_long' };
  return { ok: true, text };
}

/** Append an entry and drop oldest rows when history exceeds {@link CHAT_HISTORY_CAP}. */
export function addChatEntry(room: RoomState, entry: ChatEntry): void {
  if (!room.chat) room.chat = [];
  room.chat.push(entry);
  while (room.chat.length > CHAT_HISTORY_CAP) {
    room.chat.shift();
  }
}

export function newMessageEntry(side: Side, text: string, createdAt = Date.now()): ChatEntry {
  return { kind: 'message', id: randomUUID(), side, text, createdAt };
}

export function newSystemEntry(
  event: 'joined' | 'resigned' | 'checkmate' | 'stalemate',
  side: Side,
  createdAt = Date.now(),
): ChatEntry {
  return { kind: 'system', id: randomUUID(), event, side, createdAt };
}

const CHAT_RATE_WINDOW_MS = 5000;
const CHAT_RATE_MAX = 5;

export interface ChatRateLimiter {
  /** Returns true when the message is allowed and records it; false when rate limited. */
  tryConsume(roomCode: string, side: Side): boolean;
  reset(): void;
}

/** Per-player limiter keyed by room code + side (shared across tabs for the same seat). */
export function createChatRateLimiter(now: () => number = Date.now): ChatRateLimiter {
  const buckets = new Map<string, number[]>();

  function key(roomCode: string, side: Side): string {
    return `${roomCode.toUpperCase()}:${side}`;
  }

  return {
    tryConsume(roomCode: string, side: Side): boolean {
      const t = now();
      const k = key(roomCode, side);
      const kept = (buckets.get(k) ?? []).filter((ts) => t - ts < CHAT_RATE_WINDOW_MS);
      if (kept.length >= CHAT_RATE_MAX) {
        buckets.set(k, kept);
        return false;
      }
      kept.push(t);
      buckets.set(k, kept);
      return true;
    },
    reset() {
      buckets.clear();
    },
  };
}

/** Process-wide limiter for production WebSocket traffic. */
export const chatRateLimiter = createChatRateLimiter();

export type PostChatResult =
  { ok: true; entry: ChatEntry } | { ok: false; error: ChatRejectReason; text: string };

/**
 * Validate, authorize, rate-limit, and append a player chat message.
 * `room` may be undefined when the room code does not exist.
 */
export function postPlayerChat(
  room: RoomState | undefined,
  guestId: string,
  rawText: string,
  limiter: ChatRateLimiter = chatRateLimiter,
): PostChatResult {
  const trimmedForReject = typeof rawText === 'string' ? rawText.trim() : '';
  if (!room) {
    return { ok: false, error: 'not_a_player', text: trimmedForReject };
  }
  const side = seatFor(room, guestId);
  if (!side) {
    return { ok: false, error: 'not_a_player', text: trimmedForReject };
  }
  const validated = validateChatText(rawText);
  if (!validated.ok) {
    return { ok: false, error: validated.error, text: trimmedForReject };
  }
  if (!limiter.tryConsume(room.code, side)) {
    return { ok: false, error: 'rate_limited', text: validated.text };
  }
  const entry = newMessageEntry(side, validated.text);
  addChatEntry(room, entry);
  return { ok: true, entry };
}
