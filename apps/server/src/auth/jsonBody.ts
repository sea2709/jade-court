/**
 * Strict JSON request bodies for auth routes (blocks login CSRF via text/plain forms).
 */
import type { Context } from 'hono';

export function isJsonContentType(c: Context): boolean {
  const raw = c.req.header('content-type');
  if (!raw) return false;
  const media = raw.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return media === 'application/json';
}

export type JsonParseResult =
  { ok: true; body: unknown } | { ok: false; status: 400; error: 'invalid_request' };

/** Require `Content-Type: application/json` and parse the body. */
export async function parseAuthJsonBody(c: Context): Promise<JsonParseResult> {
  if (!isJsonContentType(c)) {
    return { ok: false, status: 400, error: 'invalid_request' };
  }
  try {
    const body = await c.req.json();
    return { ok: true, body };
  } catch {
    return { ok: false, status: 400, error: 'invalid_request' };
  }
}
