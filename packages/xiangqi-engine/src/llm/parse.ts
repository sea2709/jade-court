/**
 * Parse Gemma JSON move suggestions and match them to legal engine moves.
 */
import * as X from '../rules.js';
import type { Board, Move, Side } from '../types.js';
import type { GemmaMovePayload, ParsedMoveCoords } from './types.js';

function coordEqual(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function isCoordPair(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isInteger(v[0]) &&
    Number.isInteger(v[1])
  );
}

/** Extract move coordinates from model text (raw JSON or fenced block). */
export function parseMoveJson(text: string): ParsedMoveCoords | null {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.unshift(fence[1].trim());
  const brace = trimmed.match(/\{[\s\S]*\}/);
  if (brace) candidates.push(brace[0]);

  for (const raw of candidates) {
    try {
      const obj = JSON.parse(raw) as GemmaMovePayload;
      if (!isCoordPair(obj.from) || !isCoordPair(obj.to)) continue;
      if (!X.inBounds(obj.from[0], obj.from[1]) || !X.inBounds(obj.to[0], obj.to[1])) continue;
      return { from: obj.from, to: obj.to };
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

export function findLegalMove(board: Board, side: Side, parsed: ParsedMoveCoords): Move | null {
  const legal = X.legalMoves(board, side);
  return (
    legal.find(
      (m) => coordEqual(m.from, parsed.from) && coordEqual(m.to, parsed.to),
    ) ?? null
  );
}
