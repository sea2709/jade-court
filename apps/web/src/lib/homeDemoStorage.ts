/**
 * localStorage persistence for the homepage demo board (`jade-court-home-demo`).
 */
import type { Coord } from '@jade-court/xiangqi-engine';

export const HOME_DEMO_STORAGE_KEY = 'jade-court-home-demo';

/** Max plies in a saved demo game; longer payloads are treated as invalid. */
export const HOME_DEMO_MAX_SAVED_PLIES = 1000;

export type HomeDemoMoveRecord = { from: Coord; to: Coord };

export type HomeDemoSaveV1 = {
  v: 1;
  moves: { from: [number, number]; to: [number, number] }[];
};

function isIntCoordPair(pair: unknown): pair is [number, number] {
  return (
    Array.isArray(pair) &&
    pair.length === 2 &&
    typeof pair[0] === 'number' &&
    typeof pair[1] === 'number' &&
    Number.isInteger(pair[0]) &&
    Number.isInteger(pair[1])
  );
}

function isMoveRecord(value: unknown): value is HomeDemoSaveV1['moves'][number] {
  if (!value || typeof value !== 'object') return false;
  const o = value as { from?: unknown; to?: unknown };
  return isIntCoordPair(o.from) && isIntCoordPair(o.to);
}

/** Parses stored JSON; shape-only (legality is validated when replaying). */
export function parseHomeDemoSave(raw: string | null):
  | {
      ok: true;
      moves: HomeDemoMoveRecord[];
    }
  | {
      ok: false;
    } {
  if (raw == null || raw === '') {
    return { ok: true, moves: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false };
  const rec = parsed as { v?: unknown; moves?: unknown };
  if (rec.v !== 1) return { ok: false };
  if (!Array.isArray(rec.moves)) return { ok: false };
  if (rec.moves.length > HOME_DEMO_MAX_SAVED_PLIES) return { ok: false };
  if (!rec.moves.every(isMoveRecord)) return { ok: false };
  const moves = rec.moves.map((m) => ({
    from: [m.from[0], m.from[1]] as Coord,
    to: [m.to[0], m.to[1]] as Coord,
  }));
  return { ok: true, moves };
}

export function serializeHomeDemoSave(moves: HomeDemoMoveRecord[]): string {
  const payload: HomeDemoSaveV1 = {
    v: 1,
    moves: moves.map((m) => ({
      from: [m.from[0], m.from[1]],
      to: [m.to[0], m.to[1]],
    })),
  };
  return JSON.stringify(payload);
}

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* quota / private mode — ignore */
  }
}
