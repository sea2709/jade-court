/**
 * Opaque cursor encoding for news list pagination (sortAt + document id).
 */

export interface DecodedCursor {
  sortAt: Date;
  id: string;
}

/** Encode sortAt and id into an opaque base64url cursor string. */
export function encodeNewsCursor(sortAt: Date, id: string): string {
  const payload = JSON.stringify({ s: sortAt.toISOString(), i: id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/** Decode a cursor string; returns null when malformed. */
export function decodeNewsCursor(cursor: string): DecodedCursor | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as { s?: unknown; i?: unknown };
    if (typeof parsed.s !== 'string' || typeof parsed.i !== 'string') return null;
    const sortAt = new Date(parsed.s);
    if (Number.isNaN(sortAt.getTime())) return null;
    if (!parsed.i) return null;
    return { sortAt, id: parsed.i };
  } catch {
    return null;
  }
}

/** True when doc sorts strictly before the cursor in (sortAt desc, id desc) order. */
export function isBeforeCursor(doc: { sortAt: Date; id: string }, cursor: DecodedCursor): boolean {
  if (doc.sortAt.getTime() < cursor.sortAt.getTime()) return true;
  if (doc.sortAt.getTime() > cursor.sortAt.getTime()) return false;
  return doc.id < cursor.id;
}
