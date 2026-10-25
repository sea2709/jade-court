/**
 * Saved in-progress games (`/api/games/active*`) for Play vs Computer and Play with AI.
 */
import type { Difficulty, Side } from '@jade-court/xiangqi-engine';
import type { ChatMessage } from '../components/coach/types';
import { getGuestId } from './guestId';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export type SavedGameMode = 'pvc' | 'ai';

export interface PvcGameConfig {
  level: Difficulty;
  side: Side;
}

export interface AiGameConfig {
  modelId: string;
  difficulty: Difficulty;
  side: Side;
}

export type SavedGameConfig = PvcGameConfig | AiGameConfig;

export interface SavedMovePly {
  from: [number, number];
  to: [number, number];
}

export interface ActiveGameSummary {
  mode: SavedGameMode;
  moveCount: number;
  side: Side;
  updatedAt: string;
  level?: Difficulty;
  modelId?: string;
  difficulty?: Difficulty;
}

export interface ActiveGameSave {
  mode: SavedGameMode;
  config: SavedGameConfig;
  moves: SavedMovePly[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  chat?: ChatMessage[];
}

export interface ActiveGamesListResponse {
  games: ActiveGameSummary[];
}

export type PutActiveGameBody = {
  config: SavedGameConfig;
  moves: SavedMovePly[];
  chat?: ChatMessage[];
  baseRevision?: number;
};

export type PutActiveGameResult =
  ActiveGameSave | { finished: true; status: 'checkmate' | 'stalemate' };

export class GamesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'GamesApiError';
  }
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function gamesFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-guest-id': getGuestId(),
      ...init?.headers,
    },
  });
}

function throwGamesError(status: number, data: Record<string, unknown>): never {
  const code = typeof data.error === 'string' ? data.error : undefined;
  throw new GamesApiError(code ?? 'request_failed', status, code);
}

/** Lists unfinished saves for the signed-in player. */
export async function fetchActiveGames(): Promise<ActiveGamesListResponse> {
  const res = await gamesFetch('/api/games/active');
  const data = await parseJson(res);
  if (!res.ok) throwGamesError(res.status, data);
  const games = Array.isArray(data.games) ? (data.games as ActiveGameSummary[]) : [];
  return { games };
}

/** Loads one mode's save, or `null` when none (`404`). */
export async function fetchActiveGame(mode: SavedGameMode): Promise<ActiveGameSave | null> {
  const res = await gamesFetch(`/api/games/active/${mode}`);
  const data = await parseJson(res);
  if (res.status === 404 && data.error === 'not_found') return null;
  if (!res.ok) throwGamesError(res.status, data);
  return data as unknown as ActiveGameSave;
}

/** Creates or updates the in-progress save (optimistic concurrency via `baseRevision`). */
export async function putActiveGame(
  mode: SavedGameMode,
  body: PutActiveGameBody,
): Promise<PutActiveGameResult> {
  const res = await gamesFetch(`/api/games/active/${mode}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (res.status === 409 && data.error === 'stale_revision') {
    throw new GamesApiError('stale_revision', 409, 'stale_revision');
  }
  if (!res.ok) throwGamesError(res.status, data);
  if (data.finished === true) {
    const status = data.status === 'stalemate' ? 'stalemate' : 'checkmate';
    return { finished: true, status };
  }
  return data as unknown as ActiveGameSave;
}

/** Abandons the in-progress save (idempotent). */
export async function deleteActiveGame(mode: SavedGameMode): Promise<void> {
  const res = await gamesFetch(`/api/games/active/${mode}`, { method: 'DELETE' });
  if (res.status === 204) return;
  const data = await parseJson(res);
  if (!res.ok) throwGamesError(res.status, data);
}
