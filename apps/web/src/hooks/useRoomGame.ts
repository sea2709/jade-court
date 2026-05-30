import { useCallback, useEffect, useRef, useState } from 'react';
import { X, type Board, type Coord, type GameStatus, type Move, type Side } from '@jade-court/xiangqi-engine';
import { type PublicRoom, wsUrl } from '../lib/api';
import { getGuestId } from '../lib/guestId';

export interface RoomGameState {
  board: Board;
  turn: Side;
  history: Move[];
  status: GameStatus;
  lastMove: { from: Coord; to: Coord } | null;
  selected: Coord | null;
  targets: Move[];
  checkPos: Coord | null;
  checkSide: Side | null;
  connected: boolean;
  opponentJoined: boolean;
  error: string | null;
}

export function useRoomGame(code: string, side: Side) {
  const guestId = getGuestId();
  const wsRef = useRef<WebSocket | null>(null);
  const sideRef = useRef(side);
  sideRef.current = side;

  const [state, setState] = useState<RoomGameState>(() => ({
    board: X.initialBoard(),
    turn: 'r',
    history: [],
    status: null,
    lastMove: null,
    selected: null,
    targets: [],
    checkPos: null,
    checkSide: null,
    connected: false,
    opponentJoined: false,
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
      lastMove: last ? { from: last.from, to: last.to } : null,
      selected: null,
      targets: [],
      checkPos: checkSide ? X.findGeneral(room.board, checkSide) : null,
      checkSide,
      opponentJoined: room.redJoined && room.blackJoined,
      error: null,
    }));
  }, []);

  useEffect(() => {
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', code, guestId }));
      setState((s) => ({ ...s, connected: true, error: null }));
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as
        | { type: 'room'; room: PublicRoom }
        | { type: 'error'; message: string }
        | { type: 'move_rejected'; error: string };

      if (msg.type === 'room') applyRoom(msg.room);
      else if (msg.type === 'error') {
        setState((s) => ({ ...s, error: msg.message }));
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
        if (s.status || s.turn !== sideRef.current) return s;
        if (r < 0) return { ...s, selected: null, targets: [] };

        const p = s.board[r]?.[c];
        if (s.selected) {
          const t = s.targets.find((m) => m.to[0] === r && m.to[1] === c);
          if (t) {
            wsRef.current?.send(
              JSON.stringify({ type: 'move', from: t.from, to: t.to, guestId }),
            );
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
    [guestId],
  );

  const resetLocal = useCallback(() => {
    setState((s) => ({
      ...s,
      board: X.initialBoard(),
      turn: 'r',
      history: [],
      status: null,
      lastMove: null,
      selected: null,
      targets: [],
      checkPos: null,
      checkSide: null,
    }));
  }, []);

  return { ...state, onPoint, resetLocal, side, guestId };
}
