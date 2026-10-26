/**
 * Shared secret for test-only HTTP helpers (E2E outbox, etc.).
 */
import { timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';

/** Header Playwright / E2E clients send with `E2E_TEST_SECRET`. */
export const E2E_TEST_SECRET_HEADER = 'x-e2e-test-secret';

export function e2eTestSecret(): string {
  return process.env.E2E_TEST_SECRET?.trim() ?? '';
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Headers for Vitest / Playwright when `E2E_TEST_SECRET` is set in env. */
export function e2eTestSecretHeaders(): Record<string, string> {
  const secret = e2eTestSecret();
  if (!secret) return {};
  return { [E2E_TEST_SECRET_HEADER]: secret };
}

/**
 * When `E2E_TEST_SECRET` is unset, test helpers return 503.
 * Wrong or missing header → 403.
 */
export function requireE2eTestSecret(c: Context): Response | null {
  const expected = e2eTestSecret();
  if (!expected) {
    return c.json({ error: 'e2e_test_disabled' }, 503);
  }
  const provided = c.req.header(E2E_TEST_SECRET_HEADER)?.trim() ?? '';
  if (!secretsMatch(provided, expected)) {
    return c.json({ error: 'forbidden' }, 403);
  }
  return null;
}

/** Clear env (Vitest only). */
export function resetE2eTestSecretForTests(): void {
  delete process.env.E2E_TEST_SECRET;
}
