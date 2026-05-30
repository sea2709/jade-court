import * as X from '@jade-court/xiangqi-engine';
import type { Board, GameStatus, Move, Side } from '@jade-court/xiangqi-engine';

export interface RoomPlayer {
  userId?: string;
  guestId: string;
  side: Side;
  connected: boolean;
}

export interface RoomState {
  code: string;
  hostGuestId: string;
  board: Board;
  turn: Side;
  history: Move[];
  status: GameStatus;
  red?: RoomPlayer;
  black?: RoomPlayer;
  createdAt: number;
}

const rooms = new Map<string, RoomState>();

export function randomCode(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]!;
  return `JADE-${s}`;
}

export function createRoom(hostGuestId: string): RoomState {
  let code = randomCode();
  while (rooms.has(code)) code = randomCode();
  const room: RoomState = {
    code,
    hostGuestId,
    board: X.X.initialBoard(),
    turn: 'r',
    history: [],
    status: null,
    createdAt: Date.now(),
    red: { guestId: hostGuestId, side: 'r', connected: false },
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): RoomState | undefined {
  return rooms.get(code.toUpperCase());
}

export function joinRoom(code: string, guestId: string): { room: RoomState; side: Side } | { error: string } {
  const room = getRoom(code);
  if (!room) return { error: 'Room not found' };
  if (room.red?.guestId === guestId || room.black?.guestId === guestId) {
    const side = room.red?.guestId === guestId ? 'r' : 'b';
    return { room, side };
  }
  if (guestId === room.hostGuestId) {
    if (room.red) room.red.connected = true;
    return { room, side: 'r' };
  }
  if (!room.black) {
    room.black = { guestId, side: 'b', connected: true };
    return { room, side: 'b' };
  }
  return { error: 'Room is full' };
}

export function applyRoomMove(
  room: RoomState,
  guestId: string,
  move: Move,
): { ok: true; room: RoomState } | { ok: false; error: string } {
  if (room.status) return { ok: false, error: 'Game is over' };
  const player = room.red?.guestId === guestId ? room.red : room.black?.guestId === guestId ? room.black : null;
  if (!player || player.side !== room.turn) return { ok: false, error: 'Not your turn' };

  const legal = X.X.legalMoves(room.board, room.turn);
  const valid = legal.find(
    (m) =>
      m.from[0] === move.from[0] &&
      m.from[1] === move.from[1] &&
      m.to[0] === move.to[0] &&
      m.to[1] === move.to[1],
  );
  if (!valid) return { ok: false, error: 'Illegal move' };

  room.board = X.X.applyMove(room.board, valid);
  room.history.push(valid);
  room.turn = X.X.opp(room.turn);
  room.status = X.X.gameStatus(room.board, room.turn);
  return { ok: true, room };
}

export function publicRoomView(room: RoomState) {
  return {
    code: room.code,
    board: room.board,
    turn: room.turn,
    history: room.history,
    status: room.status,
    redJoined: !!room.red,
    blackJoined: !!room.black,
    redConnected: room.red?.connected ?? false,
    blackConnected: room.black?.connected ?? false,
  };
}
