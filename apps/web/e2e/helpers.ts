import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';
import { e2eTestHeaders } from './e2eEnv';

export const E2E_SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? 3101);
export const E2E_WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5199);
/** Direct server URL (no session cookies) — e.g. test email outbox. */
export const e2eServerUrl = `http://127.0.0.1:${E2E_SERVER_PORT}`;
/** Same origin as the browser so httpOnly session cookies are sent. */
export const e2eWebOrigin = `http://localhost:${E2E_WEB_PORT}`;

export function uniqueTestEmail(prefix = 'e2e-journey', parallelIndex?: number): string {
  const worker = parallelIndex !== undefined ? `w${parallelIndex}` : `t${Date.now()}`;
  return `${prefix}-${worker}-${Date.now()}@jade-court.test`;
}

/** Poll until the signed-in player has an active AI save with at least `minMoves` plies. */
export async function waitForActiveAiSave(
  request: APIRequestContext,
  minMoves = 1,
  timeoutMs = 30_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const res = await request.get(`${e2eWebOrigin}/api/games/active/ai`);
        if (!res.ok()) return 0;
        const body = (await res.json()) as { moves?: unknown[] };
        return body.moves?.length ?? 0;
      },
      { timeout: timeoutMs },
    )
    .toBeGreaterThanOrEqual(minMoves);
}

/** Close pages/contexts so WebSockets shut down before Playwright tears down the browser. */
export async function closeMultiplayerRoom(host: Page, guest: Page): Promise<void> {
  const pages = [host, guest];
  for (const page of pages) {
    await page.goto('about:blank').catch(() => {});
  }
  for (const page of pages) {
    await page.close().catch(() => {});
  }
  const contexts = new Set<BrowserContext>(pages.map((p) => p.context()));
  for (const ctx of contexts) {
    await ctx.close().catch(() => {});
  }
}

/** Board point (piece or empty move target) at engine coordinates `[row, col]`. */
export function square(scope: Page | Locator, r: number, c: number): Locator {
  return scope.locator(`[data-testid="board"] [data-square="${r}-${c}"]`);
}

/** Click a piece, then its destination. */
export async function playMove(
  scope: Page | Locator,
  from: [number, number],
  to: [number, number],
): Promise<void> {
  await square(scope, ...from).click({ timeout: 30_000 });
  await square(scope, ...to).click({ timeout: 30_000 });
}

/** Fulfill a route with a JSON body. */
export function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Fulfill a route with a complete server-sent-events body. */
export function sse(route: Route, events: unknown[]) {
  return route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''),
  });
}

/** Opens the verification link from the test email outbox (`NODE_ENV=test` only). */
export async function verifyEmailFromOutbox(
  request: APIRequestContext,
  page: Page,
  email: string,
): Promise<void> {
  let verifyLink: string | undefined;
  await expect(async () => {
    const outbox = await request.get(`${e2eServerUrl}/api/auth/test-email-outbox`, {
      headers: e2eTestHeaders(),
    });
    expect(outbox.ok()).toBeTruthy();
    const body = (await outbox.json()) as {
      messages: { to: string; links: string[] }[];
    };
    const msg = body.messages.find((m) => m.to === email);
    expect(msg?.links?.length).toBeGreaterThan(0);
    verifyLink = msg!.links.find((l) => l.includes('/verify-email?token='));
    expect(verifyLink).toBeTruthy();
  }).toPass({ timeout: 15_000 });

  await page.goto(verifyLink!);
  await expect(page.getByText(/Your email is verified/i)).toBeVisible({ timeout: 15_000 });
}

/**
 * Finishes fake Stripe checkout for the signed-in session (test env only).
 * When `sessionId` is omitted, starts checkout via `POST /api/billing/checkout`.
 */
export async function completeCheckout(
  request: APIRequestContext,
  opts?: { sessionId?: string },
): Promise<string> {
  let sessionId = opts?.sessionId;
  if (!sessionId) {
    const checkout = await request.post(`${e2eWebOrigin}/api/billing/checkout`, {
      headers: { 'Content-Type': 'application/json' },
      data: {},
    });
    expect(checkout.ok()).toBeTruthy();
    const body = (await checkout.json()) as { sessionId?: string };
    expect(body.sessionId).toBeTruthy();
    sessionId = body.sessionId!;
  }

  const complete = await request.post(`${e2eWebOrigin}/api/billing/test/complete-checkout`, {
    headers: { 'Content-Type': 'application/json', ...e2eTestHeaders() },
    data: { sessionId },
  });
  if (!complete.ok()) {
    const detail = await complete.text();
    throw new Error(`complete-checkout failed: ${complete.status()} ${detail}`);
  }
  return sessionId;
}

/** Stub coach + LLM opponent routes while leaving auth, billing, and game saves live. */
export function stubPlayAiLlmRoutes(page: Page): Promise<void[]> {
  return Promise.all([
    page.route('**/api/ai/models', (route) =>
      json(route, {
        models: [{ id: 'gemini-flash', label: 'Gemini Flash' }],
        defaultId: 'gemini-flash',
      }),
    ),
    page.route('**/api/coach/opening', (route) =>
      json(route, { text: 'Welcome to the E2E court!', source: 'llm' }),
    ),
    page.route('**/api/coach/feedback/stream', (route) =>
      sse(route, [
        {
          type: 'meta',
          verdict: 'great',
          label: 'Great move!',
          emoji: '★',
          tone: 'great',
          lossCp: 0,
        },
        { type: 'token', text: 'Stubbed ' },
        { type: 'token', text: 'feedback.' },
        { type: 'done', source: 'llm' },
      ]),
    ),
    page.route('**/api/ai/move', (route) =>
      json(route, {
        move: { from: [0, 1], to: [2, 2] },
        source: 'llm',
        comment: 'Stub opponent develops the horse.',
      }),
    ),
    page.route('**/api/coach/ask/stream', (route) =>
      sse(route, [
        { type: 'token', text: 'Stubbed answer.' },
        { type: 'done', source: 'llm' },
      ]),
    ),
    page.route('**/api/coach/hint/stream', (route) =>
      sse(route, [
        { type: 'meta', move: { from: [7, 7], to: [7, 4] } },
        { type: 'token', text: 'Stubbed hint: centralise the cannon.' },
        { type: 'done', source: 'llm' },
      ]),
    ),
  ]);
}

/** Signs in through the admin login form (uses e2e server credentials). */
export async function adminLoginViaForm(
  page: Page,
  opts?: { username?: string; password?: string; next?: string },
): Promise<void> {
  const next = opts?.next ? `?next=${encodeURIComponent(opts.next)}` : '';
  await page.goto(`/admin/login${next}`);
  await page.getByLabel('Username').fill(opts?.username ?? 'e2e-admin');
  await page.getByLabel('Password').fill(opts?.password ?? 'e2e-pass');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/admin\/login/);
}
