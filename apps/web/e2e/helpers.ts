import type { Locator, Page, Route } from '@playwright/test';

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
  await square(scope, ...from).click();
  await square(scope, ...to).click();
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
