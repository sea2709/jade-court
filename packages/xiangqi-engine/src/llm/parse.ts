/**
 * Parse Gemma JSON move suggestions and match them to legal engine moves.
 */
import * as X from '../rules.js';
import type { Board, Move, Side } from '../types.js';
import type {
  CoachFeedbackPayload,
  CoachHintPayload,
  CoachOpeningPayload,
  GemmaMovePayload,
  ParsedMoveCoords,
} from './types.js';

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

function jsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.unshift(fence[1].trim());
  const brace = trimmed.match(/\{[\s\S]*\}/);
  if (brace) candidates.push(brace[0]);
  return candidates;
}

function parsePayload(text: string): GemmaMovePayload | null {
  for (const raw of jsonCandidates(text)) {
    try {
      return JSON.parse(raw) as GemmaMovePayload;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/** Extract move coordinates from model text (raw JSON or fenced block). */
export function parseMoveJson(text: string): ParsedMoveCoords | null {
  const obj = parsePayload(text);
  if (!obj || !isCoordPair(obj.from) || !isCoordPair(obj.to)) return null;
  if (!X.inBounds(obj.from[0], obj.from[1]) || !X.inBounds(obj.to[0], obj.to[1])) return null;
  return { from: obj.from, to: obj.to };
}

/** Resolve a model response to a legal move (moveIndex preferred, then from/to). */
export function resolveModelMove(
  board: Board,
  side: Side,
  legal: Move[],
  text: string,
): { move: Move; comment?: string } | null {
  const obj = parsePayload(text);
  if (!obj) return null;

  let comment: string | undefined;
  if (typeof obj.comment === 'string' && obj.comment.trim()) comment = obj.comment.trim();

  if (typeof obj.moveIndex === 'number' && Number.isFinite(obj.moveIndex)) {
    const i = Math.floor(obj.moveIndex) - 1;
    if (i >= 0 && i < legal.length) return { move: legal[i]!, comment };
  }

  const parsed = parseMoveJson(text);
  if (parsed) {
    const move = findLegalMove(board, side, parsed);
    if (move) return { move, comment };
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

function nonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function parseCoachFeedbackJson(text: string): { desc: string; body: string } | null {
  const obj = parsePayload(text) as CoachFeedbackPayload | null;
  if (!obj) return null;
  const desc = nonEmptyString(obj.desc);
  const body = nonEmptyString(obj.body);
  if (!desc || !body) return null;
  return { desc, body };
}

export function parseCoachHintJson(text: string): { text: string; tip: string } | null {
  const obj = parsePayload(text) as CoachHintPayload | null;
  if (!obj) return null;
  const hintText = nonEmptyString(obj.text);
  const tip = nonEmptyString(obj.tip);
  if (!hintText || !tip) return null;
  return { text: hintText, tip };
}

export function parseCoachOpeningJson(text: string): { text: string } | null {
  const obj = parsePayload(text) as CoachOpeningPayload | null;
  if (!obj) return null;
  const openingText = nonEmptyString(obj.text);
  if (!openingText) return null;
  return { text: openingText };
}
