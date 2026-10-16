/**
 * Optional display names for Play with Friends (localStorage + labels).
 */
import type { Side } from '@jade-court/xiangqi-engine';

export const DISPLAY_NAME_STORAGE_KEY = 'jade-court-display-name';
export const DISPLAY_NAME_MAX_LENGTH = 20;

/** Trim and collapse internal whitespace (client-side; server applies the same rules). */
export function normalizeDisplayNameInput(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function getStoredDisplayName(): string {
  return localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) ?? '';
}

export function saveDisplayNameInput(raw: string): void {
  const normalized = normalizeDisplayNameInput(raw).slice(0, DISPLAY_NAME_MAX_LENGTH);
  if (normalized) localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, normalized);
  else localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY);
}

/** Value to send on create/join; omit when empty after normalise. */
export function displayNameForApi(raw: string): string | undefined {
  const normalized = normalizeDisplayNameInput(raw);
  if (!normalized) return undefined;
  return normalized.slice(0, DISPLAY_NAME_MAX_LENGTH);
}

export const RED_PLAYER_FALLBACK = 'Red player';
export const BLACK_PLAYER_FALLBACK = 'Black player';

export function seatLabel(
  side: Side,
  redName: string | null | undefined,
  blackName: string | null | undefined,
): string {
  const name = side === 'r' ? redName : blackName;
  if (name && name.trim()) return name;
  return side === 'r' ? RED_PLAYER_FALLBACK : BLACK_PLAYER_FALLBACK;
}

export function opponentSeatLabel(
  viewerSide: Side,
  redName: string | null | undefined,
  blackName: string | null | undefined,
): string {
  return seatLabel(viewerSide === 'r' ? 'b' : 'r', redName, blackName);
}
