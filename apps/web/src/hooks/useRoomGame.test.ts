/**
 * Unit tests for `useRoomGame` focused on the resign path.
 *
 * Mocks `WebSocket` with a tiny in-memory class so we can drive `open` /
 * `message` and capture outbound frames. The wider hook (initial subscribe,
 * state mirroring, move rejection) was already wired pre-issue; these tests
 * pin down the new behavior introduced by Issue #40:
 *   - `resign()` sends the right message
 *   - it is idempotent across double-fires
 *   - the server-reported `status === 'resigned'` + `winner` is mirrored
 *     into state for both players
 *   - errors with `{ error }` (new contract) and `{ message }` (legacy)
 *     both surface in `state.error`
 */
import { act, renderHook } from '@testing-library/react';
import { X } from '@jade-court/xiangqi-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoomGame } from './useRoomGame';

/**
 * Minimal WebSocket mock: real `ws.readyState`, an `open()` to flip to OPEN,
 * a `dispatch(type, payload)` helper, and a `sent` capture array. Handlers
 * (onopen / onmessage / onclose) are wired by the hook exactly as on a
 * real socket, so we don't have to reimplement them here.
 */
function installWebSocketMock() {
  type Handler = ((ev: unknown) => void) | null;
  class FakeWS {
    static instances: FakeWS[] = [];
    static OPEN = 1;
    readyState = 0; // CONNECTING
    sent: string[] = [];
    onopen: Handler = null;
    onmessage: Handler = null;
    onclose: Handler = null;
    onerror: Handler = null;
    constructor(_url: string) {
      FakeWS.instances.push(this);
    }
    open() {
      this.readyState = FakeWS.OPEN;
      const h = this.onopen;
      if (h) h({});
    }
    dispatch(type: 'message', payload: unknown) {
      const h = this.onmessage;
      if (h) h({ data: JSON.stringify(payload) });
    }
    send(frame: string) {
      this.sent.push(frame);
    }
    close() {
      this.readyState = 3;
      const h = this.onclose;
      if (h) h({});
    }
  }
  vi.stubGlobal('WebSocket', FakeWS);
  return FakeWS;
}

const initialBoard = X.initialBoard();
const setupRoom = (code = 'JADE-TEST', side: 'r' | 'b' = 'r', guestId = 'guest-host') => {
  localStorage.setItem('jade-court-guest-id', guestId);
  return renderHook<ReturnType<typeof useRoomGame>, { code: string; side: 'r' | 'b' }>(
    ({ code, side }) => useRoomGame(code, side),
    { initialProps: { code, side } },
  );
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useRoomGame — resign', () => {
  it('sends a single `{ type: "resign" }` frame when the hook is open', () => {
    const WS = installWebSocketMock();
    const { result } = setupRoom();

    act(() => {
      WS.instances[0]!.open();
    });

    act(() => {
      result.current.resign();
      result.current.resign(); // double-fire (StrictMode / rapid clicks)
      result.current.resign();
    });

    const resignFrames = WS.instances[0]!.sent.filter((s) => JSON.parse(s).type === 'resign');
    expect(resignFrames).toHaveLength(1);
    expect(JSON.parse(resignFrames[0]!)).toEqual({ type: 'resign', guestId: 'guest-host' });
  });

  it('does not send a resign frame before the socket is open', () => {
    const WS = installWebSocketMock();
    const { result } = setupRoom();
    // Socket is still CONNECTING — no open() call.
    act(() => {
      result.current.resign();
    });
    expect(WS.instances[0]!.sent).toHaveLength(0);
  });

  it('mirrors `status === "resigned"` and `winner` into state on the resign broadcast', () => {
    const WS = installWebSocketMock();
    const { result } = setupRoom();

    act(() => WS.instances[0]!.open());

    act(() => {
      WS.instances[0]!.dispatch('message', {
        type: 'room',
        room: {
          code: 'JADE-TEST',
          board: initialBoard,
          turn: 'b',
          history: [],
          status: 'resigned',
          winner: 'b',
          redJoined: true,
          blackJoined: true,
          redConnected: true,
          blackConnected: true,
        },
      });
    });

    expect(result.current.status).toBe('resigned');
    expect(result.current.winner).toBe('b');
  });

  it('suppresses a late resign after the resigned broadcast already arrived', () => {
    const WS = installWebSocketMock();
    const { result } = setupRoom();

    act(() => WS.instances[0]!.open());

    act(() => {
      WS.instances[0]!.dispatch('message', {
        type: 'room',
        room: {
          code: 'JADE-TEST',
          board: initialBoard,
          turn: 'b',
          history: [],
          status: 'resigned',
          winner: 'b',
          redJoined: true,
          blackJoined: true,
          redConnected: true,
          blackConnected: true,
        },
      });
    });

    act(() => {
      result.current.resign();
    });
    const resignFrames = WS.instances[0]!.sent.filter((s) => JSON.parse(s).type === 'resign');
    expect(resignFrames).toHaveLength(0);
  });

  it('re-arms the resign guard for a fresh subscription (new code)', () => {
    const WS = installWebSocketMock();
    const { result, rerender } = setupRoom();
    act(() => WS.instances[0]!.open());

    // First session: send one resign, second call is deduped.
    act(() => {
      result.current.resign();
      result.current.resign();
    });
    expect(WS.instances[0]!.sent.filter((s) => JSON.parse(s).type === 'resign')).toHaveLength(1);

    // Switch to a different code — the effect re-runs (old socket closes,
    // a fresh WebSocket is created) and resets the dedupe guard.
    rerender({ code: 'JADE-NEW', side: 'r' });
    act(() => {
      WS.instances.at(-1)!.open();
      result.current.resign();
    });
    expect(WS.instances.at(-1)!.sent.filter((s) => JSON.parse(s).type === 'resign')).toHaveLength(
      1,
    );
  });

  it('surfaces new `error`-field failures (resign contract) in state.error', () => {
    const WS = installWebSocketMock();
    const { result } = setupRoom();
    act(() => WS.instances[0]!.open());

    act(() => {
      WS.instances[0]!.dispatch('message', {
        type: 'error',
        error: 'Game is over',
      });
    });
    expect(result.current.error).toBe('Game is over');
  });

  it('still surfaces legacy `message`-field errors', () => {
    const WS = installWebSocketMock();
    const { result } = setupRoom();
    act(() => WS.instances[0]!.open());

    act(() => {
      WS.instances[0]!.dispatch('message', {
        type: 'error',
        message: 'Invalid message',
      });
    });
    expect(result.current.error).toBe('Invalid message');
  });
});
