/**
 * Request body parsing for active game saves.
 */
import type { Difficulty, Side } from '@jade-court/xiangqi-engine';
import type { AiConfig, GameMode, PvcConfig, SavedChatMessage } from './types.js';

function parseSide(v: unknown): Side | undefined {
  if (v === 'r' || v === 'b') return v;
  return undefined;
}

function parseDifficulty(v: unknown): Difficulty | undefined {
  if (v === 'beginner' || v === 'intermediate' || v === 'advanced') return v;
  return undefined;
}

export function parseGameMode(raw: string): GameMode | undefined {
  if (raw === 'pvc' || raw === 'ai') return raw;
  return undefined;
}

export function parsePvcConfig(raw: unknown): PvcConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const level = parseDifficulty(o.level);
  const side = parseSide(o.side);
  if (!level || !side) return null;
  return { level, side };
}

export function parseAiConfig(raw: unknown): AiConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const difficulty = parseDifficulty(o.difficulty);
  const side = parseSide(o.side);
  const modelId = typeof o.modelId === 'string' ? o.modelId.trim() : '';
  if (!difficulty || !side || modelId.length === 0) return null;
  return { modelId, difficulty, side };
}

function isChatMessage(v: unknown): v is SavedChatMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as SavedChatMessage;
  if (typeof m.id !== 'number' || !Number.isFinite(m.id)) return false;
  if (m.from !== 'coach' && m.from !== 'player' && m.from !== 'system') return false;
  if (typeof m.text !== 'string') return false;
  return true;
}

export function parseChatArray(raw: unknown): SavedChatMessage[] | null | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return null;
  if (!raw.every(isChatMessage)) return null;
  return raw as SavedChatMessage[];
}

export function parseBaseRevision(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) return undefined;
  return raw;
}
