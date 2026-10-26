/**
 * Shared E2E values for Playwright tests and the `webServer` Hono env (keep in sync).
 */
export const E2E_TEST_SECRET = 'e2e-playwright-test-secret-0123456789ab';

export const E2E_TEST_SECRET_HEADER = 'x-e2e-test-secret';

/** Headers for test-only server routes (`test-email-outbox`, `test/complete-checkout`). */
export function e2eTestHeaders(): Record<string, string> {
  return { [E2E_TEST_SECRET_HEADER]: E2E_TEST_SECRET };
}
