/**
 * JSON shapes for active game API responses.
 */
import type {
  ActiveGameResponse,
  ActiveGameSummary,
  AiConfig,
  PvcConfig,
  SavedGameRecord,
} from './types.js';

export function toActiveGameSummary(record: SavedGameRecord): ActiveGameSummary {
  const base = {
    mode: record.mode,
    moveCount: record.moves.length,
    updatedAt: record.updatedAt.toISOString(),
  };
  if (record.mode === 'pvc') {
    const config = record.config as PvcConfig;
    return { ...base, side: config.side, level: config.level };
  }
  const config = record.config as AiConfig;
  return {
    ...base,
    side: config.side,
    modelId: config.modelId,
    difficulty: config.difficulty,
  };
}

export function toActiveGameResponse(record: SavedGameRecord): ActiveGameResponse {
  return {
    mode: record.mode,
    config: record.config,
    moves: record.moves,
    ...(record.chat ? { chat: record.chat } : {}),
    revision: record.revision,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
