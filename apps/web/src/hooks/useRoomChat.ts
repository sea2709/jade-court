/**
 * In-room chat state over the shared room WebSocket (`useRoomGame`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Side } from '@jade-court/xiangqi-engine';
import type { RoomWsMessage } from './useRoomGame';
import type {
  ChatEntry,
  ChatRejectReason,
  DisplayChatRow,
  PendingChatEntry,
} from '../lib/roomChatTypes';

export type RoomChatRejection = { error: ChatRejectReason; text: string };

/** Remove only the first pending row matching `match` (FIFO for duplicate in-flight sends). */
function withoutFirstPendingMatch(
  prev: DisplayChatRow[],
  match: (row: PendingChatEntry) => boolean,
): DisplayChatRow[] {
  let removed = false;
  return prev.filter((row) => {
    if (!removed && row.kind === 'pending' && match(row)) {
      removed = true;
      return false;
    }
    return true;
  });
}

export function useRoomChat(options: {
  viewerSide: Side;
  connected: boolean;
  subscribeToMessages: (fn: (msg: RoomWsMessage) => void) => () => void;
  sendWs: (payload: object) => void;
}) {
  const { viewerSide, connected, subscribeToMessages, sendWs } = options;
  const [entries, setEntries] = useState<DisplayChatRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [lastRejection, setLastRejection] = useState<RoomChatRejection | null>(null);
  const chatVisibleRef = useRef(true);
  const nextPendingId = useRef(0);

  const setChatVisible = useCallback((visible: boolean) => {
    chatVisibleRef.current = visible;
    if (visible) setUnread(0);
  }, []);

  const clearRejection = useCallback(() => setLastRejection(null), []);

  const upsertConfirmed = useCallback((message: ChatEntry) => {
    setEntries((prev) => {
      const withoutPending =
        message.kind === 'message'
          ? withoutFirstPendingMatch(
              prev,
              (row) => row.side === message.side && row.text === message.text,
            )
          : prev;
      if (
        withoutPending.some(
          (row) => (row.kind === 'message' || row.kind === 'system') && row.id === message.id,
        )
      ) {
        return withoutPending;
      }
      return [...withoutPending, message];
    });
  }, []);

  useEffect(() => {
    return subscribeToMessages((msg) => {
      if (msg.type === 'chat_history') {
        setEntries(Array.isArray(msg.messages) ? msg.messages : []);
        return;
      }
      if (msg.type === 'chat') {
        const message = msg.message;
        upsertConfirmed(message);
        if (message.kind === 'message' && message.side !== viewerSide && !chatVisibleRef.current) {
          setUnread((n) => n + 1);
        }
        return;
      }
      if (msg.type === 'chat_rejected') {
        setLastRejection({ error: msg.error, text: msg.text });
        setEntries((prev) =>
          withoutFirstPendingMatch(prev, (row) => row.text.trim() === msg.text.trim()),
        );
      }
    });
  }, [subscribeToMessages, upsertConfirmed, viewerSide]);

  const sendChat = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || !connected) return;
      clearRejection();
      const pending: PendingChatEntry = {
        kind: 'pending',
        id: `pending-${++nextPendingId.current}`,
        side: viewerSide,
        text,
        createdAt: Date.now(),
      };
      setEntries((prev) => [...prev, pending]);
      sendWs({ type: 'chat', text: raw });
    },
    [clearRejection, connected, sendWs, viewerSide],
  );

  return {
    messages: entries,
    sendChat,
    unread,
    setChatVisible,
    lastRejection,
    clearRejection,
    connected,
  };
}
