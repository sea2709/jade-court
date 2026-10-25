/**
 * Persistence for in-progress pvc / ai saves (`savedGames` in Mongo).
 */
import type {
  GameMode,
  SavedGameRecord,
  UpsertActiveGameInput,
  UpsertActiveGameResult,
} from './types.js';
import type { ActiveGameSummary } from './types.js';

export interface SavedGameStore {
  listSummaries(userId: string): Promise<ActiveGameSummary[]>;

  findByUserAndMode(userId: string, mode: GameMode): Promise<SavedGameRecord | null>;

  upsert(input: UpsertActiveGameInput): Promise<UpsertActiveGameResult>;

  delete(userId: string, mode: GameMode): Promise<boolean>;
}
