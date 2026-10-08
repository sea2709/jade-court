import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs its own server + Vite on dedicated ports so it never reuses a local `pnpm dev`.
 * The server runs with the negamax opponent and no LLM keys or MongoDB; Learn specs stub
 * LLM routes in the browser with `page.route`.
 */
const SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? 3101);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5199);
const serverUrl = `http://127.0.0.1:${SERVER_PORT}`;
const webUrl = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 1000 } },
    },
  ],
  webServer: [
    {
      command: 'pnpm exec tsx src/index.ts',
      cwd: '../server',
      url: `${serverUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: String(SERVER_PORT),
        PLAY_OPPONENT_PROVIDER: 'local',
        PIKAFISH_PATH: '',
        GEMINI_API_KEY: '',
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: '',
        MONGODB_URI: '',
      },
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      url: webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { JADE_API_PROXY_TARGET: serverUrl, JADE_E2E_QUIET: '1' },
    },
  ],
});
