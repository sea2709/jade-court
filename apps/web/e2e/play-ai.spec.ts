import { expect, test, type Page } from '@playwright/test';
import { json, playMove, square, sse } from './helpers';

const chat = '.learn-chat-panel';

const activeMe = {
  user: {
    id: 'e2e-user',
    email: 'e2e@jade-court.test',
    emailVerified: true,
    displayName: 'E2E',
    accessUntil: new Date(Date.now() + 86_400_000).toISOString(),
    preferredModelId: null,
  },
  access: {
    active: true,
    accessUntil: new Date(Date.now() + 86_400_000).toISOString(),
  },
};

function stubPlayAiApi(page: Page) {
  return Promise.all([
    page.route('**/api/me', (route) => json(route, activeMe)),
    page.route('**/api/ai/models', (route) =>
      json(route, {
        models: [{ id: 'stub-model', label: 'Stub Model' }],
        defaultId: 'stub-model',
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

test.describe('Play with AI (stubbed LLM)', () => {
  test.beforeEach(async ({ page }) => {
    await stubPlayAiApi(page);
    await page.goto('/play-ai');
  });

  test('shows the LLM opening message', async ({ page }) => {
    await expect(page.locator(chat).getByText('Welcome to the E2E court!')).toBeVisible();
    await expect(page.getByTestId('play-ai-game')).toBeVisible();
    await expect(page.getByText('vs Master Lin (AI)')).toBeVisible();
  });

  test('grades the player move and applies the opponent reply', async ({ page }) => {
    await expect(page.getByText('Your move (Red)')).toBeVisible();
    await playMove(page, [7, 1], [7, 4]);

    const panel = page.locator(chat);
    await expect(panel.locator('.chat-bubble-player').getByText('Cannon advances.')).toBeVisible();
    await expect(panel.getByText('Great move!')).toBeVisible();
    await expect(panel.getByText('Stubbed feedback.')).toBeVisible();
    await expect(panel.getByText('Stub opponent develops the horse.')).toBeVisible();
    await expect(square(page, 2, 2)).toHaveAttribute('data-piece', 'bH');
    await expect(page.getByText('Your move (Red)')).toBeVisible();
  });

  test('answers a question in the coach chat', async ({ page }) => {
    await page.getByPlaceholder('Ask Master Lin…').fill('What should I do?');
    await page.getByRole('button', { name: 'Send' }).click();
    const panel = page.locator(chat);
    await expect(panel.getByText('What should I do?')).toBeVisible();
    await expect(panel.getByText('Stubbed answer.')).toBeVisible();
  });

  test('shows a hint and highlights the suggested move', async ({ page }) => {
    await page.getByRole('button', { name: '💡 Show me a hint' }).click();
    await expect(
      page.locator(chat).getByText('Stubbed hint: centralise the cannon.'),
    ).toBeVisible();
    await expect(page.locator('.hint-from')).toBeVisible();
    await expect(page.locator('.hint-to')).toBeVisible();
  });
});

test.describe('Play with AI (LLM unconfigured)', () => {
  test.beforeEach(async ({ page }) => {
    // Broad stub first; Playwright matches routes in reverse registration order.
    await page.route('**/api/**', (route) => json(route, { error: 'llm_unconfigured' }, 503));
    await page.route('**/api/ai/models', (route) =>
      json(route, { error: 'llm_unconfigured' }, 503),
    );
    await page.route('**/api/me', (route) => json(route, activeMe));
    await page.goto('/play-ai');
  });

  test('falls back to template coaching and the local opponent', async ({ page }) => {
    const panel = page.locator(chat);
    await expect(panel.getByText(/Welcome! I'm Master Lin/)).toBeVisible();

    await playMove(page, [7, 1], [7, 4]);
    await expect(panel.locator('.chat-bubble-player').getByText('Cannon advances.')).toBeVisible();
    await expect(panel.getByText(/I'll play/)).toBeVisible();
    await expect(page.getByText('Your move (Red)')).toBeVisible();

    await page.getByPlaceholder('Ask Master Lin…').fill('Any tips?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(panel.getByText(/Try the hint button/)).toBeVisible();
  });
});

test.describe('Play with AI legacy route', () => {
  test('/learn redirects to /play-ai', async ({ page }) => {
    await page.route('**/api/me', (route) => json(route, activeMe));
    await page.route('**/api/ai/models', (route) =>
      json(route, { models: [], defaultId: 'default' }),
    );
    await page.route('**/api/coach/opening', (route) =>
      json(route, { text: 'Hi', source: 'template' }),
    );
    await page.goto('/learn');
    await expect(page).toHaveURL(/\/play-ai$/);
  });
});
