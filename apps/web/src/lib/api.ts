import type { Board, GameStatus, Move, Side } from '@jade-court/xiangqi-engine';
import { getGuestId } from './guestId';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-guest-id': getGuestId(),
      ...init?.headers,
    },
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

/**
 * Public room view pushed by the server over `/ws` and returned by `/api/rooms*`.
 * `status` widens to include `'resigned'` for online concessions; `winner` is
 * `null` while in progress and set from the server once the game ends
 * (loser on checkmate/stalemate = side to move; on resign = opponent of the
 * resigning player).
 */
export interface PublicRoom {
  code: string;
  board: Board;
  turn: Side;
  history: Move[];
  status: GameStatus | 'resigned';
  winner: Side | null;
  redJoined: boolean;
  blackJoined: boolean;
  redConnected: boolean;
  blackConnected: boolean;
  redName: string | null;
  blackName: string | null;
}

export function createRoom(options?: { displayName?: string }) {
  const body =
    options?.displayName !== undefined
      ? JSON.stringify({ displayName: options.displayName })
      : '{}';
  return api<{ code: string; room: PublicRoom }>('/api/rooms', { method: 'POST', body });
}

export function joinRoom(code: string, options?: { displayName?: string }) {
  const body =
    options?.displayName !== undefined
      ? JSON.stringify({ displayName: options.displayName })
      : '{}';
  return api<{ side: 'r' | 'b'; room: PublicRoom }>(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    body,
  });
}

/** Read a room; `side` is the seat this guest already holds, or null when not seated. */
export function getRoom(code: string) {
  return api<{ room: PublicRoom; side: Side | null }>(`/api/rooms/${encodeURIComponent(code)}`);
}

export function wsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
