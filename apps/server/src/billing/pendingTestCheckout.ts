/**
 * Tracks checkout session ids issued in test/E2E for `complete-checkout` validation.
 */

const WINDOW_MS = 15 * 60_000;

type Entry = { userId: string; createdAt: number };

const bySessionId = new Map<string, Entry>();

function dropExpired(now: number): void {
  for (const [id, entry] of bySessionId) {
    if (now - entry.createdAt >= WINDOW_MS) {
      bySessionId.delete(id);
    }
  }
}

/** Record a session created by `POST /api/billing/checkout` in test env. */
export function registerTestCheckoutSession(
  userId: string,
  sessionId: string,
  now = Date.now(),
): void {
  dropExpired(now);
  bySessionId.set(sessionId, { userId, createdAt: now });
}

/**
 * True when the session belongs to the user and is within the 15-minute window.
 * Consumes the entry so the same id cannot be completed by another user.
 */
export function claimTestCheckoutSession(
  userId: string,
  sessionId: string,
  now = Date.now(),
): boolean {
  dropExpired(now);
  const entry = bySessionId.get(sessionId);
  if (!entry || entry.userId !== userId) {
    return false;
  }
  if (now - entry.createdAt >= WINDOW_MS) {
    bySessionId.delete(sessionId);
    return false;
  }
  bySessionId.delete(sessionId);
  return true;
}

/** Reset store (Vitest only). */
export function resetPendingTestCheckoutForTests(): void {
  bySessionId.clear();
}
