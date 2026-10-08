import { describe, expect, it } from 'vitest';
import { X } from '@jade-court/xiangqi-engine';
import type { Board, Piece } from '@jade-court/xiangqi-engine';
import {
  applyRoomMove,
  createRoom,
  getRoom,
  joinRoom,
  publicRoomView,
  randomCode,
} from './rooms.js';

let n = 0;
const guest = (label: string) => `${label}-${++n}`;

function boardWith(...pieces: [number, number, Piece][]): Board {
  const b = Array.from({ length: 10 }, () => Array(9).fill(null)) as Board;
  for (const [r, c, p] of pieces) b[r][c] = p;
  return b;
}

/** Host is Red, second guest is Black. */
function seatedRoom() {
  const red = guest('red');
  const black = guest('black');
  const room = createRoom(red);
  joinRoom(room.code, black);
  return { room, red, black };
}

describe('randomCode', () => {
  it('uses the JADE- prefix and unambiguous characters', () => {
    for (let i = 0; i < 50; i++) expect(randomCode()).toMatch(/^JADE-[A-HJ-NP-Z2-9]{4}$/);
  });
});

describe('createRoom / getRoom', () => {
  it('seats the host as Red on a fresh board', () => {
    const host = guest('host');
    const room = createRoom(host);
    expect(room.red).toMatchObject({ guestId: host, side: 'r' });
    expect(room.black).toBeUndefined();
    expect(room.turn).toBe('r');
    expect(room.board).toEqual(X.initialBoard());
  });

  it('looks rooms up case-insensitively', () => {
    const room = createRoom(guest('host'));
    expect(getRoom(room.code.toLowerCase())).toBe(room);
    expect(getRoom('JADE-NOPE')).toBeUndefined();
  });
});

describe('joinRoom', () => {
  it('gives the second guest Black', () => {
    const room = createRoom(guest('host'));
    const res = joinRoom(room.code, guest('guest'));
    expect(res).toMatchObject({ side: 'b' });
  });

  it('rejects a third guest', () => {
    const { room } = seatedRoom();
    expect(joinRoom(room.code, guest('third'))).toEqual({ error: 'Room is full' });
  });

  it('is idempotent for seated players', () => {
    const { room, red, black } = seatedRoom();
    expect(joinRoom(room.code, red)).toMatchObject({ side: 'r' });
    expect(joinRoom(room.code, black)).toMatchObject({ side: 'b' });
    expect(room.black?.guestId).toBe(black);
  });

  it('reports unknown rooms', () => {
    expect(joinRoom('JADE-0000', guest('x'))).toEqual({ error: 'Room not found' });
  });
});

describe('applyRoomMove', () => {
  it('applies a legal move and passes the turn', () => {
    const { room, red } = seatedRoom();
    const res = applyRoomMove(room, red, { from: [9, 1], to: [7, 2] });
    expect(res.ok).toBe(true);
    expect(room.turn).toBe('b');
    expect(room.history).toHaveLength(1);
    expect(room.board[7][2]).toEqual({ t: 'H', s: 'r' });
    expect(room.board[9][1]).toBeNull();
  });

  it('rejects moves out of turn', () => {
    const { room, black } = seatedRoom();
    expect(applyRoomMove(room, black, { from: [0, 1], to: [2, 2] })).toEqual({
      ok: false,
      error: 'Not your turn',
    });
  });

  it('rejects guests who are not seated', () => {
    const { room } = seatedRoom();
    expect(applyRoomMove(room, 'intruder', { from: [9, 1], to: [7, 2] })).toEqual({
      ok: false,
      error: 'Not your turn',
    });
  });

  it('rejects illegal moves without changing state', () => {
    const { room, red } = seatedRoom();
    const before = X.cloneBoard(room.board);
    expect(applyRoomMove(room, red, { from: [9, 0], to: [5, 0] })).toEqual({
      ok: false,
      error: 'Illegal move',
    });
    expect(room.board).toEqual(before);
    expect(room.turn).toBe('r');
  });

  it('records checkmate and rejects further moves', () => {
    const { room, red, black } = seatedRoom();
    room.board = boardWith(
      [9, 3, { t: 'G', s: 'r' }],
      [0, 4, { t: 'G', s: 'b' }],
      [5, 0, { t: 'R', s: 'r' }],
      [1, 8, { t: 'R', s: 'r' }],
    );
    const res = applyRoomMove(room, red, { from: [5, 0], to: [0, 0] });
    expect(res.ok).toBe(true);
    expect(room.status).toBe('checkmate');
    expect(applyRoomMove(room, black, { from: [0, 4], to: [1, 4] })).toEqual({
      ok: false,
      error: 'Game is over',
    });
  });
});

describe('publicRoomView', () => {
  it('exposes seats without guest ids', () => {
    const { room } = seatedRoom();
    const view = publicRoomView(room);
    expect(view).toMatchObject({ redJoined: true, blackJoined: true, turn: 'r', status: null });
    expect(JSON.stringify(view)).not.toContain('guestId');
  });
});
