import * as X from '@jade-court/xiangqi-engine';
import type { Board, GameStatus, Move, Side } from '@jade-court/xiangqi-engine';

export interface RoomPlayer {
  userId?: string;
  guestId: string;
  side: Side;
  connected: boolean;
  /** Normalised display name when the player set one at create/join; absent when unset. */
  displayName?: string;
}

export const DISPLAY_NAME_MAX_LENGTH = 20;

/** Trim, collapse internal whitespace; empty after normalise becomes null. */
export function normalizeDisplayName(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  return collapsed === '' ? null : collapsed;
}

export function parseDisplayNameField(
  raw: unknown,
): { ok: true; displayName: string | null } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, displayName: null };
  if (typeof raw !== 'string') return { ok: false, error: 'Invalid display name' };
  const displayName = normalizeDisplayName(raw);
  if (displayName && displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, error: 'Display name must be at most 20 characters' };
  }
  return { ok: true, displayName };
}

export interface RoomState {
  code: string;
  hostGuestId: string;
  board: Board;
  turn: Side;
  history: Move[];
  /** Null while in progress; 'resigned' is a room-level extension for conceded online games. */
  status: GameStatus | 'resigned';
  /** Winning side once the game ends (opponent of the loser); null while in progress. */
  winner: Side | null;
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

export function createRoom(hostGuestId: string, displayName?: string | null): RoomState {
  let code = randomCode();
  while (rooms.has(code)) code = randomCode();
  const red: RoomPlayer = { guestId: hostGuestId, side: 'r', connected: false };
  const hostName = normalizeDisplayName(displayName ?? null);
  if (hostName) red.displayName = hostName;
  const room: RoomState = {
    code,
    hostGuestId,
    board: X.X.initialBoard(),
    turn: 'r',
    history: [],
    status: null,
    winner: null,
    createdAt: Date.now(),
    red,
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): RoomState | undefined {
  return rooms.get(code.toUpperCase());
}

export function joinRoom(
  code: string,
  guestId: string,
  displayName?: string | null,
): { room: RoomState; side: Side } | { error: string } {
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
    const black: RoomPlayer = { guestId, side: 'b', connected: true };
    const guestName = normalizeDisplayName(displayName ?? null);
    if (guestName) black.displayName = guestName;
    room.black = black;
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
  const player =
    room.red?.guestId === guestId ? room.red : room.black?.guestId === guestId ? room.black : null;
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
  // Loser is the side to move after the flip (checkmate or Xiangqi stalemate), so the winner is the opposite.
  room.winner = room.status ? X.X.opp(room.turn) : null;
  return { ok: true, room };
}

/**
 * Resign: a seated player concedes on any turn and the opponent wins immediately.
 * Deliberately turn-agnostic — resigning must not wait for your move.
 */
export function resignRoom(
  room: RoomState,
  guestId: string,
): { ok: true } | { ok: false; error: string } {
  if (room.status) return { ok: false, error: 'Game is over' };
  const player =
    room.red?.guestId === guestId ? room.red : room.black?.guestId === guestId ? room.black : null;
  if (!player) return { ok: false, error: 'Not a player in this room' };
  room.status = 'resigned';
  room.winner = X.X.opp(player.side);
  return { ok: true };
}

export function publicRoomView(room: RoomState) {
  return {
    code: room.code,
    board: room.board,
    turn: room.turn,
    history: room.history,
    status: room.status,
    winner: room.winner ?? null,
    redJoined: !!room.red,
    blackJoined: !!room.black,
    redConnected: room.red?.connected ?? false,
    blackConnected: room.black?.connected ?? false,
    redName: room.red?.displayName ?? null,
    blackName: room.black?.displayName ?? null,
  };
}
