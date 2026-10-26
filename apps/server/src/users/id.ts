/**
 * Player id format helpers (admin search by id).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when `id` matches RFC 4122 UUID string form (memory store user ids). */
export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}
