import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  type Board,
  type Coord,
  type GameStatus,
  type Move,
  type Side,
} from '@jade-court/xiangqi-engine';
import { type PublicRoom, wsUrl } from '../lib/api';
import { getGuestId } from '../lib/guestId';

/**
 * Online room game state (multiplayer `useRoomGame`).
 *
 * `status` widens to `'resigned'` for online concessions; `winner` mirrors the
 * server-side winner (null while in progress). Both fields are pushed by the
 * server in every `room` snapshot, so re-substituting after a refresh renders
 * the same game-over state as the live-client path.
 */
export interface RoomGameState {
  board: Board;
  turn: Side;
  history: Move[];
  status: GameStatus | 'resigned';
  winner: Side | null;
  lastMove: { from: Coord; to: Coord } | null;
  selected: Coord | null;
  targets: Move[];
  checkPos: Coord | null;
  checkSide: Side | null;
  connected: boolean;
  opponentJoined: boolean;
  redName: string | null;
  blackName: string | null;
  redConnected: boolean;
  blackConnected: boolean;
  error: string | null;
}

/**
 * Drives a multiplayer (online) game room over `/ws`.
 *
 * Owns the WebSocket, mirrors `room` snapshots into React state, and exposes
 * `resign()` so the UI can offer a "Resign" action that goes through the
 * server — never mutating local game state directly.
 */
export function useRoomGame(code: string, side: Side) {
  const guestId = getGuestId();
  const wsRef = useRef<WebSocket | null>(null);
  /** Set when a resign has been sent for the current room+code. Reset when
   *  the socket/teardown effect re-runs (new code) AND once a `resigned`
   *  snapshot is applied (so a future rematch could resign again — out of
   *  scope today, but keeps the guard round-trippable for the same room). */
  const resignSentRef = useRef(false);

  const [state, setState] = useState<RoomGameState>(() => ({
    board: X.initialBoard(),
    turn: 'r',
    history: [],
    status: null,
    winner: null,
    lastMove: null,
    selected: null,
    targets: [],
    checkPos: null,
    checkSide: null,
    connected: false,
    opponentJoined: false,
    redName: null,
    blackName: null,
    redConnected: false,
    blackConnected: false,
    error: null,
  }));

  const applyRoom = useCallback((room: PublicRoom) => {
    const last = room.history.at(-1);
    const checkSide = X.inCheck(room.board, room.turn) ? room.turn : null;
    setState((s) => ({
      ...s,
      board: X.cloneBoard(room.board),
      turn: room.turn,
      history: room.history,
      status: room.status,
      winner: room.winner,
      lastMove: last ? { from: last.from, to: last.to } : null,
      selected: null,
      targets: [],
      checkPos: checkSide ? X.findGeneral(room.board, checkSide) : null,
      checkSide,
      opponentJoined: room.redJoined && room.blackJoined,
      redName: room.redName ?? null,
      blackName: room.blackName ?? null,
      redConnected: room.redConnected,
      blackConnected: room.blackConnected,
      error: null,
    }));
    // The resigned snapshot also counts as "already resigned" so a stray
    // late `resign()` call (e.g. click right as the broadcast arrives) is
    // suppressed at the hook level.
    if (room.status === 'resigned') resignSentRef.current = true;
  }, []);

  useEffect(() => {
    // A new subscription means a new room/session: clear the local
    // dedupe flag so a brand-new game could resign afresh.
    resignSentRef.current = false;
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', code, guestId }));
      setState((s) => ({ ...s, connected: true, error: null }));
    };

    ws.onmessage = (ev) => {
      // Errors may carry either `message` (legacy parse/subscribe failures)
      // or `error` (new resign failures). Read both so the UI shows the
      // server's wording either way.
      const msg = JSON.parse(ev.data as string) as
        | { type: 'room'; room: PublicRoom }
        | { type: 'error'; message?: string; error?: string }
        | { type: 'move_rejected'; error: string };

      if (msg.type === 'room') applyRoom(msg.room);
      else if (msg.type === 'error') {
        const text = msg.error ?? msg.message ?? 'Unknown error';
        setState((s) => ({ ...s, error: text }));
      } else if (msg.type === 'move_rejected') {
        setState((s) => ({ ...s, error: msg.error }));
      }
    };

    ws.onclose = () => setState((s) => ({ ...s, connected: false }));
    ws.onerror = () => setState((s) => ({ ...s, error: 'Connection lost', connected: false }));

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [code, guestId, applyRoom]);

  const onPoint = useCallback(
    (r: number, c: number) => {
      setState((s) => {
        if (s.status || s.turn !== side) return s;
        if (r < 0) return { ...s, selected: null, targets: [] };

        const p = s.board[r]?.[c];
        if (s.selected) {
          const t = s.targets.find((m) => m.to[0] === r && m.to[1] === c);
          if (t) {
            wsRef.current?.send(JSON.stringify({ type: 'move', from: t.from, to: t.to, guestId }));
            return { ...s, selected: null, targets: [] };
          }
        }
        if (p && p.s === s.turn) {
          return {
            ...s,
            selected: [r, c],
            targets: X.movesFrom(s.board, r, c),
          };
        }
        return { ...s, selected: null, targets: [] };
      });
    },
    [guestId, side],
  );

  const resetLocal = useCallback(() => {
    setState((s) => ({
      ...s,
      board: X.initialBoard(),
      turn: 'r',
      history: [],
      status: null,
      winner: null,
      lastMove: null,
      selected: null,
      targets: [],
      checkPos: null,
      checkSide: null,
    }));
  }, []);

  /**
   * Send `{ type: 'resign', guestId }` to the server. Idempotent at the
   * hook level: at most one resign per (current) room, regardless of how
   * many times the UI calls it (double-click, StrictMode double-fire).
   * Returns `true` if a message was sent, `false` if it was suppressed by
   * the dedupe guard or because the socket isn't open yet.
   */
  const resign = useCallback(() => {
    if (resignSentRef.current) return false;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    resignSentRef.current = true;
    ws.send(JSON.stringify({ type: 'resign', guestId }));
    return true;
  }, [guestId]);

  return { ...state, onPoint, resetLocal, resign, side, guestId };
}
