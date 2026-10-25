/**
 * In-memory SavedGameStore for tests and when MongoDB is not configured.
 */
import type {
  GameMode,
  SavedGameRecord,
  UpsertActiveGameInput,
  UpsertActiveGameResult,
} from './types.js';
import type { SavedGameStore } from './store.js';
import { toActiveGameSummary } from './serialize.js';

function key(userId: string, mode: GameMode): string {
  return `${userId}:${mode}`;
}

export class MemorySavedGameStore implements SavedGameStore {
  private byKey = new Map<string, SavedGameRecord>();

  async listSummaries(userId: string) {
    const rows = [...this.byKey.values()].filter((r) => r.userId === userId);
    rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return rows.map((r) => toActiveGameSummary(r));
  }

  async findByUserAndMode(userId: string, mode: GameMode): Promise<SavedGameRecord | null> {
    const row = this.byKey.get(key(userId, mode));
    return row
      ? { ...row, moves: [...row.moves], chat: row.chat ? [...row.chat] : undefined }
      : null;
  }

  async upsert(input: UpsertActiveGameInput): Promise<UpsertActiveGameResult> {
    const k = key(input.userId, input.mode);
    const existing = this.byKey.get(k);
    const baseRevision = input.baseRevision ?? 0;

    if (existing) {
      if (baseRevision !== existing.revision) {
        return { ok: false, reason: 'stale_revision' };
      }
      const now = new Date();
      const record: SavedGameRecord = {
        userId: input.userId,
        mode: input.mode,
        config: input.config,
        moves: [...input.moves],
        ...(input.chat !== undefined
          ? { chat: [...input.chat] }
          : existing.chat
            ? { chat: [...existing.chat] }
            : {}),
        revision: existing.revision + 1,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      this.byKey.set(k, record);
      return { ok: true, record: { ...record } };
    }

    const now = new Date();
    const record: SavedGameRecord = {
      userId: input.userId,
      mode: input.mode,
      config: input.config,
      moves: [...input.moves],
      ...(input.chat ? { chat: [...input.chat] } : {}),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.byKey.set(k, record);
    return { ok: true, record: { ...record } };
  }

  async delete(userId: string, mode: GameMode): Promise<boolean> {
    return this.byKey.delete(key(userId, mode));
  }
}
