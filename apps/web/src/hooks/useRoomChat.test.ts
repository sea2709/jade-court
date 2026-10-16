import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomWsMessage } from './useRoomGame';
import { useRoomChat } from './useRoomChat';

function createBus() {
  const listeners = new Set<(msg: RoomWsMessage) => void>();
  return {
    subscribe: (fn: (msg: RoomWsMessage) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit: (msg: RoomWsMessage) => {
      for (const fn of listeners) fn(msg);
    },
    sendWs: vi.fn(),
  };
}

describe('useRoomChat', () => {
  afterEach(() => vi.clearAllMocks());

  it('loads chat_history and handles chat echoes', () => {
    const bus = createBus();
    const { result } = renderHook(() =>
      useRoomChat({
        viewerSide: 'r',
        connected: true,
        subscribeToMessages: bus.subscribe,
        sendWs: bus.sendWs,
      }),
    );

    act(() => {
      bus.emit({
        type: 'chat_history',
        messages: [
          {
            kind: 'message',
            id: 'm1',
            side: 'b',
            text: 'Hi',
            createdAt: 1,
          },
        ],
      });
    });
    expect(result.current.messages).toHaveLength(1);

    act(() => {
      bus.emit({
        type: 'chat',
        message: {
          kind: 'message',
          id: 'm2',
          side: 'r',
          text: 'Hello',
          createdAt: 2,
        },
      });
    });
    expect(result.current.messages).toHaveLength(2);
  });

  it('sendChat posts `{ type: "chat" }` on the socket', () => {
    const bus = createBus();
    const { result } = renderHook(() =>
      useRoomChat({
        viewerSide: 'r',
        connected: true,
        subscribeToMessages: bus.subscribe,
        sendWs: bus.sendWs,
      }),
    );

    act(() => result.current.sendChat('  hey there  '));
    expect(bus.sendWs).toHaveBeenCalledWith({ type: 'chat', text: '  hey there  ' });
    expect(result.current.messages.some((m) => m.kind === 'pending')).toBe(true);
  });

  it('increments unread for opponent messages while hidden', () => {
    const bus = createBus();
    const { result } = renderHook(() =>
      useRoomChat({
        viewerSide: 'r',
        connected: true,
        subscribeToMessages: bus.subscribe,
        sendWs: bus.sendWs,
      }),
    );

    act(() => result.current.setChatVisible(false));
    act(() => {
      bus.emit({
        type: 'chat',
        message: {
          kind: 'message',
          id: 'x',
          side: 'b',
          text: 'ping',
          createdAt: 1,
        },
      });
    });
    expect(result.current.unread).toBe(1);

    act(() => {
      bus.emit({
        type: 'chat',
        message: {
          kind: 'system',
          id: 'sys',
          event: 'joined',
          side: 'b',
          createdAt: 2,
        },
      });
    });
    expect(result.current.unread).toBe(1);

    act(() => result.current.setChatVisible(true));
    expect(result.current.unread).toBe(0);
  });

  it('confirms duplicate pending rows one echo at a time (FIFO)', () => {
    const bus = createBus();
    const { result } = renderHook(() =>
      useRoomChat({
        viewerSide: 'r',
        connected: true,
        subscribeToMessages: bus.subscribe,
        sendWs: bus.sendWs,
      }),
    );

    act(() => {
      result.current.sendChat('gg');
      result.current.sendChat('gg');
    });
    expect(result.current.messages.filter((m) => m.kind === 'pending')).toHaveLength(2);

    act(() => {
      bus.emit({
        type: 'chat',
        message: { kind: 'message', id: 'm1', side: 'r', text: 'gg', createdAt: 1 },
      });
    });
    expect(result.current.messages.filter((m) => m.kind === 'pending')).toHaveLength(1);
    expect(result.current.messages.filter((m) => m.kind === 'message')).toHaveLength(1);

    act(() => {
      bus.emit({
        type: 'chat',
        message: { kind: 'message', id: 'm2', side: 'r', text: 'gg', createdAt: 2 },
      });
    });
    expect(result.current.messages.filter((m) => m.kind === 'pending')).toHaveLength(0);
    expect(result.current.messages).toHaveLength(2);
  });

  it('ignores malformed chat_history payloads', () => {
    const bus = createBus();
    const { result } = renderHook(() =>
      useRoomChat({
        viewerSide: 'r',
        connected: true,
        subscribeToMessages: bus.subscribe,
        sendWs: bus.sendWs,
      }),
    );

    act(() => {
      bus.emit({
        type: 'chat_history',
        messages: null,
      } as unknown as RoomWsMessage);
    });
    expect(result.current.messages).toEqual([]);
  });

  it('surfaces chat_rejected and drops the matching pending row', () => {
    const bus = createBus();
    const { result } = renderHook(() =>
      useRoomChat({
        viewerSide: 'r',
        connected: true,
        subscribeToMessages: bus.subscribe,
        sendWs: bus.sendWs,
      }),
    );

    act(() => result.current.sendChat('too fast'));
    expect(result.current.messages).toHaveLength(1);

    act(() => {
      bus.emit({ type: 'chat_rejected', error: 'rate_limited', text: 'too fast' });
    });
    expect(result.current.lastRejection?.error).toBe('rate_limited');
    expect(result.current.messages).toHaveLength(0);
  });
});
