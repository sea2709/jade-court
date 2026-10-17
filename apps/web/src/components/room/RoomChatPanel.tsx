/**
 * In-room chat: desktop collapsible panel and mobile bottom sheet.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Side } from '@jade-court/xiangqi-engine';
import {
  chatEmptyHint,
  chatRejectionMessage,
  groupChatRows,
  latestPlayerMessageText,
} from '../../lib/roomChatFormat';
import { ROOM_CHAT_MAX_LENGTH } from '../../lib/roomChatTypes';
import { ChevronIcon } from '../ChevronIcon';
import type { RoomChatRejection } from '../../hooks/useRoomChat';
import type { DisplayChatRow } from '../../lib/roomChatTypes';

const MOBILE_MEDIA = '(max-width: 1023px)';

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(MOBILE_MEDIA).matches;
  });
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MEDIA);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="room-chat-unread-badge"
      data-testid="room-chat-unread"
      aria-label={`${count} unread messages`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function RoomChatInput({
  connected,
  lastRejection,
  onClearRejection,
  onSend,
}: {
  connected: boolean;
  lastRejection: RoomChatRejection | null;
  onClearRejection: () => void;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState('');
  const rejectionRestored = useRef<string | null>(null);

  useEffect(() => {
    if (!lastRejection) {
      rejectionRestored.current = null;
      return;
    }
    if (rejectionRestored.current === lastRejection.text) return;
    rejectionRestored.current = lastRejection.text;
    setValue(lastRejection.text);
  }, [lastRejection]);

  const len = value.length;
  const overLimit = len > ROOM_CHAT_MAX_LENGTH;
  const showCounter = len >= 400;
  const canSend = connected && value.trim().length > 0 && !overLimit;

  const submit = () => {
    if (!canSend) return;
    onSend(value);
    setValue('');
    onClearRejection();
  };

  return (
    <div className="flex flex-col gap-2">
      {lastRejection && (
        <p className="m-0 text-red-deep font-bold text-[13px]" role="alert">
          {chatRejectionMessage(lastRejection.error)}
        </p>
      )}
      {!connected && (
        <p className="m-0 text-muted font-semibold text-[13px]">Reconnecting… chat is paused</p>
      )}
      <div className="flex gap-2 items-end">
        <textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (lastRejection) onClearRejection();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={!connected}
          rows={2}
          placeholder="Type a message…"
          aria-label="Chat message"
          data-testid="room-chat-input"
          className={`room-chat-input flex-1 resize-none ${overLimit ? 'room-chat-input-over' : ''}`}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm shrink-0"
          disabled={!canSend}
          onClick={submit}
        >
          Send
        </button>
      </div>
      {showCounter && (
        <div
          className={`text-[12px] font-bold text-right ${overLimit ? 'text-red-deep' : 'text-muted'}`}
          data-testid="room-chat-counter"
        >
          {len} / {ROOM_CHAT_MAX_LENGTH}
        </div>
      )}
    </div>
  );
}

function MessageList({
  messages,
  viewerSide,
  redName,
  blackName,
  opponentJoined,
  listRef,
  onAtBottomChange,
}: {
  messages: DisplayChatRow[];
  viewerSide: Side;
  redName: string | null;
  blackName: string | null;
  opponentJoined: boolean;
  listRef: RefObject<HTMLDivElement | null>;
  onAtBottomChange: (atBottom: boolean) => void;
}) {
  const groups = groupChatRows(messages, viewerSide, redName, blackName);
  const [showNewPill, setShowNewPill] = useState(false);

  const checkBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return true;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    onAtBottomChange(atBottom);
    if (atBottom) setShowNewPill(false);
    return atBottom;
  }, [listRef, onAtBottomChange]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = checkBottom();
    if (atBottom) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    // After layout, show the pill when new rows arrived while the user is scrolled up.
    const id = requestAnimationFrame(() => setShowNewPill(true));
    return () => cancelAnimationFrame(id);
  }, [messages, checkBottom, listRef]);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      setShowNewPill(false);
      onAtBottomChange(true);
    }
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={listRef}
        className="scroll-area flex-1 overflow-y-auto p-4 flex flex-col gap-3"
        onScroll={checkBottom}
        data-testid="room-chat-message-list"
      >
        {messages.length === 0 && (
          <p className="text-center text-muted font-semibold text-[14px] m-0">
            {chatEmptyHint(viewerSide, opponentJoined, redName, blackName)}
          </p>
        )}
        {groups.map((group) => {
          if (group.kind === 'system') {
            return (
              <div
                key={group.id}
                className="text-center text-muted text-[13px] font-bold py-0.5"
                data-testid="room-chat-system-line"
              >
                {group.text}
              </div>
            );
          }
          const tone = group.side === 'r' ? 'text-red-deep' : 'text-black-deep';
          const badge = group.side === 'r' ? '帥' : '將';
          return (
            <div key={`${group.side}-${group.items[0]?.id}`} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[12.5px] font-bold">
                <span
                  className={`w-6 h-6 rounded-md grid place-items-center text-white text-xs ${
                    group.side === 'r' ? 'bg-red-deep' : 'bg-black-deep'
                  }`}
                >
                  {badge}
                </span>
                <span className={tone}>{group.label}</span>
                <span className="text-muted font-semibold">{group.time}</span>
              </div>
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className={`pop flex ${item.mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={item.mine ? 'chat-bubble-player' : 'chat-bubble'}
                    data-pending={item.pending ? 'true' : undefined}
                  >
                    <div
                      className={`text-[14.5px] leading-normal font-semibold text-ink ${
                        item.pending ? 'opacity-50' : ''
                      }`}
                    >
                      {item.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {showNewPill && (
        <button type="button" className="room-chat-new-pill" onClick={scrollToBottom}>
          New messages ↓
        </button>
      )}
    </div>
  );
}

export interface RoomChatPanelProps {
  messages: DisplayChatRow[];
  viewerSide: Side;
  redName: string | null;
  blackName: string | null;
  opponentJoined: boolean;
  connected: boolean;
  unread: number;
  lastRejection: RoomChatRejection | null;
  onSend: (text: string) => void;
  onClearRejection: () => void;
  onVisibilityChange: (visible: boolean) => void;
}

export function RoomChatPanel({
  messages,
  viewerSide,
  redName,
  blackName,
  opponentJoined,
  connected,
  unread,
  lastRejection,
  onSend,
  onClearRejection,
  onVisibilityChange,
}: RoomChatPanelProps) {
  const isMobile = useIsMobile();
  // Chat starts closed on every room visit (desktop and mobile).
  const [desktopCollapsed, setDesktopCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const preview = latestPlayerMessageText(messages);

  const chatExpanded = isMobile ? mobileOpen : !desktopCollapsed;

  useEffect(() => {
    const visible = chatExpanded;
    onVisibilityChange(visible);
  }, [chatExpanded, onVisibilityChange]);

  const toggleDesktopCollapsed = () => setDesktopCollapsed((c) => !c);

  const openMobile = () => setMobileOpen(true);
  const closeMobile = () => setMobileOpen(false);

  const headerBadge = !connected ? (
    <span className="pill pill-red text-[11px] py-0.5 px-2">Reconnecting</span>
  ) : null;

  if (isMobile) {
    return (
      <>
        {!mobileOpen && (
          <button
            type="button"
            className="room-chat-mobile-bar"
            onClick={openMobile}
            data-testid="room-chat-mobile-bar"
          >
            <span className="font-extrabold text-[14px] text-ink">Chat</span>
            <span className="flex-1 min-w-0 truncate text-[13px] text-ink-soft font-semibold text-left">
              {preview ?? 'Tap to open chat'}
            </span>
            <UnreadBadge count={unread} />
          </button>
        )}
        {mobileOpen && (
          <div className="room-chat-sheet-root" data-testid="room-chat-sheet">
            <button
              type="button"
              className="room-chat-sheet-backdrop"
              aria-label="Close chat"
              onClick={closeMobile}
            />
            <div className="room-chat-sheet card flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-line-soft flex items-center gap-2">
                <span className="font-extrabold text-[16px]">Chat</span>
                {headerBadge}
                <button
                  type="button"
                  className="ml-auto btn btn-ghost btn-sm"
                  aria-label="Close chat"
                  onClick={closeMobile}
                >
                  ✕
                </button>
              </div>
              <MessageList
                messages={messages}
                viewerSide={viewerSide}
                redName={redName}
                blackName={blackName}
                opponentJoined={opponentJoined}
                listRef={listRef}
                onAtBottomChange={(v) => {
                  atBottomRef.current = v;
                }}
              />
              <div className="p-3.5 border-t border-line-soft bg-cream">
                <RoomChatInput
                  connected={connected}
                  lastRejection={lastRejection}
                  onClearRejection={onClearRejection}
                  onSend={onSend}
                />
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  if (desktopCollapsed) {
    return (
      <button
        type="button"
        className="card room-chat-collapsed-row"
        onClick={toggleDesktopCollapsed}
        aria-expanded={false}
        data-testid="room-chat-collapsed"
      >
        <span className="font-extrabold text-[14px] shrink-0">Chat</span>
        <span className="flex-1 min-w-0 truncate text-[13px] text-ink-soft font-semibold text-left">
          {preview ?? 'No messages yet'}
        </span>
        <UnreadBadge count={unread} />
        <span className="text-muted shrink-0 grid place-items-center">
          <ChevronIcon direction="down" testId="room-chat-chevron-down" />
        </span>
      </button>
    );
  }

  return (
    <div
      className="card room-chat-panel flex flex-col overflow-hidden"
      data-testid="room-chat-panel"
    >
      <div className="px-4 py-3 border-b border-line-soft flex items-center gap-2">
        <span className="font-extrabold text-[16px]">Chat</span>
        <span className="pill pill-gold text-[11px] py-0.5 px-2">Room</span>
        {headerBadge}
        <button
          type="button"
          className="ml-auto btn btn-ghost btn-sm"
          aria-label="Collapse chat"
          aria-expanded={true}
          data-testid="room-chat-collapse"
          onClick={toggleDesktopCollapsed}
        >
          <ChevronIcon direction="up" testId="room-chat-chevron-up" />
        </button>
      </div>
      <MessageList
        messages={messages}
        viewerSide={viewerSide}
        redName={redName}
        blackName={blackName}
        opponentJoined={opponentJoined}
        listRef={listRef}
        onAtBottomChange={(v) => {
          atBottomRef.current = v;
        }}
      />
      <div className="p-3.5 border-t border-line-soft bg-cream">
        <RoomChatInput
          connected={connected}
          lastRejection={lastRejection}
          onClearRejection={onClearRejection}
          onSend={onSend}
        />
      </div>
    </div>
  );
}
