/**
 * Saved active games (Play vs Computer and Play with AI) for registered users.
 */
import type { Coord, Difficulty, GameStatus, Side } from '@jade-court/xiangqi-engine';

export type GameMode = 'pvc' | 'ai';

export type PvcConfig = {
  level: Difficulty;
  side: Side;
};

export type AiConfig = {
  modelId: string;
  difficulty: Difficulty;
  side: Side;
};

export type SavedMove = {
  from: Coord;
  to: Coord;
};

/** Chat rows compatible with web `useCoachChat` / `ChatMessage`. */
export type SavedChatMessage = {
  id: number;
  from: 'coach' | 'player' | 'system';
  text: string;
  verdict?: string;
  label?: string;
  emoji?: string;
  tone?: string;
  lossCp?: number;
  sub?: string;
  think?: boolean;
};

export type SavedGameRecord = {
  userId: string;
  mode: GameMode;
  config: PvcConfig | AiConfig;
  moves: SavedMove[];
  chat?: SavedChatMessage[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

/** `GET /api/games/active` list item. */
export type ActiveGameSummary = {
  mode: GameMode;
  moveCount: number;
  side: Side;
  level?: Difficulty;
  modelId?: string;
  difficulty?: Difficulty;
  updatedAt: string;
};

/** `GET` / `PUT` success body for a single active save. */
export type ActiveGameResponse = {
  mode: GameMode;
  config: PvcConfig | AiConfig;
  moves: SavedMove[];
  chat?: SavedChatMessage[];
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type UpsertActiveGameInput = {
  userId: string;
  mode: GameMode;
  config: PvcConfig | AiConfig;
  moves: SavedMove[];
  chat?: SavedChatMessage[];
  /** Omit or `0` for a new save; must match current revision when updating. */
  baseRevision?: number;
};

export type UpsertActiveGameResult =
  { ok: true; record: SavedGameRecord } | { ok: false; reason: 'stale_revision' };

export type ReplayMovesResult = { ok: true; status: GameStatus } | { ok: false };
