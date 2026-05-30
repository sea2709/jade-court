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

export interface PublicRoom {
  code: string;
  board: import('@jade-court/xiangqi-engine').Board;
  turn: import('@jade-court/xiangqi-engine').Side;
  history: import('@jade-court/xiangqi-engine').Move[];
  status: import('@jade-court/xiangqi-engine').GameStatus;
  redJoined: boolean;
  blackJoined: boolean;
  redConnected: boolean;
  blackConnected: boolean;
}

export function createRoom() {
  return api<{ code: string; room: PublicRoom }>('/api/rooms', { method: 'POST' });
}

export function joinRoom(code: string) {
  return api<{ side: 'r' | 'b'; room: PublicRoom }>(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
  });
}

export function getRoom(code: string) {
  return api<{ room: PublicRoom }>(`/api/rooms/${encodeURIComponent(code)}`);
}

export function wsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
