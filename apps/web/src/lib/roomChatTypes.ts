/**
 * In-room chat payloads from the room WebSocket (mirrors server `chat.ts`).
 */
import type { Side } from '@jade-court/xiangqi-engine';

export const ROOM_CHAT_MAX_LENGTH = 500;
export const ROOM_CHAT_COUNTER_FROM = 400;
export const ROOM_CHAT_GROUP_MS = 2 * 60 * 1000;

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

export type RoomChatWsMessage =
  | { type: 'chat'; message: ChatEntry }
  | { type: 'chat_history'; messages: ChatEntry[] }
  | { type: 'chat_rejected'; error: ChatRejectReason; text: string };

/** Client-only row while waiting for the server echo. */
export type PendingChatEntry = {
  kind: 'pending';
  id: string;
  side: Side;
  text: string;
  createdAt: number;
};

export type DisplayChatRow = ChatEntry | PendingChatEntry;
