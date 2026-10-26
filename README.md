# Jade Court

**Learn & play Xiangqi** — a TypeScript monorepo with a React PWA for coaching, solo play, and real-time friend rooms. The shared rules engine runs in the browser and on the server so online moves are validated authoritatively.

For the full roadmap and architecture notes, see [.cursor/plans/jade-court-implementation.md](.cursor/plans/jade-court-implementation.md).

## Features

| Mode                 | Route          | What it does                                                                                                                                                                                                                                                                                                                                |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Learn with AI**    | `/learn`       | Play vs the computer with **Master Lin** coach chat — bidirectional messages, move grading, hints, piece tips, and free-form questions. With an LLM API key, coach copy streams over SSE (`POST /api/coach/{feedback,hint,ask}/stream`); piece tips stay instant and local. Falls back to template copy when the LLM is off or unavailable. |
| **Play vs Computer** | `/play`        | Same engine and board, lighter UI; beginner / intermediate / advanced difficulty.                                                                                                                                                                                                                                                           |
| **Friends**          | `/multiplayer` | Create or join a `JADE-XXXX` room over WebSocket, or **pass-and-play** on one device (no server).                                                                                                                                                                                                                                           |

## Stack

| Layer          | Technology                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| **Web**        | React 19, Vite, Tailwind CSS v4, React Router, `vite-plugin-pwa` (installable PWA)                          |
| **Server**     | Hono REST + WebSocket (`ws`), guest sessions via `x-guest-id`                                               |
| **Game logic** | `packages/xiangqi-engine` — rules, negamax AI, coach heuristics, LLM prompt helpers; Vitest golden tests    |
| **Rooms**      | In-memory store (lost on restart); optional **MongoDB** for finished online games when `MONGODB_URI` is set |

Local dev proxies `/api` and `/ws` from the web app to the server — no production env vars required.

## Visual design

The app uses a **fixed** Jade Court look (no Tweaks panel): bamboo board tones, **flat** piece style (`pcs-flat`), jade accent (`#1F9E81`), and a warm cream background. Design tokens and component classes live in `apps/web/src/index.css` (Tailwind v4); `applyTheme()` in `apps/web/src/lib/theme.ts` only applies the flat piece style at startup.

## Requirements

- Node.js 20+
- pnpm 9+
- [GitHub CLI (`gh`)](https://cli.github.com/) — optional for local dev; **required** for the [issue-driven workflow](.cursor/docs/github-workflow.md)

## GitHub

The repo is set up for standard GitHub flow: CI on `main`, issue forms, PR template, and agent docs ([AGENTS.md](AGENTS.md), [.cursor/docs/github-workflow.md](.cursor/docs/github-workflow.md)).

**First push** (after `git init` locally):

```bash
git add .
git commit -m "chore: initial commit"
git branch -M main
git remote add origin git@github.com:OWNER/jade-court.git
git push -u origin main
```

Or create the remote with `gh repo create` — see the full checklist in [.cursor/docs/github-workflow.md](.cursor/docs/github-workflow.md).

**CI badge** — add after the repo exists on GitHub (replace `OWNER/jade-court`):

```markdown
[![CI](https://github.com/OWNER/jade-court/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/jade-court/actions/workflows/ci.yml)
```

**Issues** — use `./scripts/issue-context.sh <n>` to print issue title, body, and labels for agent context (requires `gh auth login`).

## Quick start

Run the app in Docker (the default way to start the server) — MongoDB, the Hono server, and Vite, all from your checkout with hot reload:

```bash
pnpm dev:docker         # docker compose -f docker-compose.dev.yml up --build
pnpm dev:docker:status  # container health, web/server URLs, server config, recent errors
pnpm dev:docker:logs    # follow logs (optionally: server | web | mongo)
pnpm dev:docker:down    # stop the containers (Mongo data and node_modules volumes are kept)
```

Add `--watch` (or `--watch 5` for a 5-second interval) to `dev:docker:status` to keep it refreshing in a second terminal.

The server container always uses the bundled MongoDB (`mongodb://mongo:27017`, reachable from the host at `mongodb://localhost:27018`). To use Pikafish, set `PIKAFISH_DIR` in `.env` to the host folder holding the binary and `pikafish.nnue`. See the header of [`docker-compose.dev.yml`](docker-compose.dev.yml) for details. Keep running `pnpm lint`, `pnpm test`, etc. on the host; those need `pnpm install` on the host too.

Without Docker:

```bash
pnpm install
pnpm build          # builds xiangqi-engine (required before first dev run)
pnpm dev            # web :5173 + server :3001 in parallel
```

Or run apps separately:

```bash
pnpm dev:web
pnpm dev:server
```

- Web: http://localhost:5173
- Server health: http://localhost:3001/health

Copy [`.env.example`](.env.example) → `.env` at the repo root; set `GEMINI_API_KEY` there for Gemma opponent moves and Master Lin coach copy (see [Environment variables](#environment-variables)).

### Tests, lint & typecheck

```bash
pnpm test           # Vitest unit tests (engine, server, web)
pnpm test:coverage  # same, with v8 coverage summaries (HTML in each package's coverage/)
pnpm test:e2e       # Playwright E2E (starts its own server :3101 + Vite :5199)
pnpm typecheck      # all packages
pnpm lint           # ESLint (pnpm lint:fix to auto-fix)
pnpm format         # Prettier write (pnpm format:check in CI)
pnpm build          # engine + web + server
```

E2E needs a built engine (`pnpm build`) and a one-time browser install:
`pnpm --filter @jade-court/web exec playwright install chromium`. Playwright starts its own Hono
server on `:3101` and Vite on `:5199` (see `apps/web/playwright.config.ts`):

- `PLAY_OPPONENT_PROVIDER=local`, no MongoDB (`MONGODB_URI` unset — in-memory stores).
- Player auth: `SESSION_SECRET`, `EMAIL_PROVIDER=console`, and `GET /api/auth/test-email-outbox` in test.
- Billing: fake Stripe (`STRIPE_E2E_FAKE=1` + placeholder `STRIPE_*` keys); E2E completes checkout via
  `POST /api/billing/test/complete-checkout` (see `apps/web/e2e/play-ai-journey.spec.ts`).
- Most Play with AI specs stub coach/LLM routes in the browser; the **journey** spec exercises real
  register → verify → day pass → saved game APIs end to end.

### Play with AI journey (E2E)

`apps/web/e2e/play-ai-journey.spec.ts` is the regression net for the full product path: create an
account, verify email from the test outbox, purchase a day pass (fake Stripe), play one coached move,
ask Master Lin (stubbed LLM routes), reload and resume the autosaved game, then sign out from the
avatar menu.

### Player accounts, Stripe test mode, and OAuth

Copy [`.env.example`](.env.example) and set at minimum:

| Concern                               | Variables                                                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sessions                              | `SESSION_SECRET` (32+ random chars)                                                                                                                                                                                      |
| Email                                 | `EMAIL_PROVIDER` (`console` for local dev; `resend` or `smtp` in production), `PUBLIC_APP_URL`, `EMAIL_FROM`                                                                                                             |
| Day pass                              | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` — use [Stripe test mode](https://stripe.com/docs/testing) keys locally; run `stripe listen --forward-to localhost:3001/api/billing/webhook` for webhooks |
| Fake Stripe (E2E / local without API) | Set all three `STRIPE_*` vars plus `STRIPE_E2E_FAKE=1` (or rely on `NODE_ENV=test` in Playwright)                                                                                                                        |
| Google / Facebook sign-in             | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, or `FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET`; redirect URI `{PUBLIC_APP_URL}/api/auth/oauth/{google\|facebook}/callback`                                                    |
| Dev-only fake OAuth                   | `OAUTH_FAKE_ENABLED=1` with `NODE_ENV=development` — instant test users without real OAuth (never enable in production)                                                                                                  |

**Meta (Facebook) app review:** use a public `PUBLIC_APP_URL` (staging), add the OAuth redirect URL in the Meta developer console, request `email` (and any login permissions you use), and submit screen recordings of sign-in plus the Play with AI flow. Jade Court does not embed the Facebook SDK in the web app; login is server-side OAuth only.

## Project structure

| Path                       | Role                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `packages/xiangqi-engine/` | Shared Xiangqi rules, AI, coach; used by web and server              |
| `apps/web/`                | Vite React PWA — screens, board UI, room client                      |
| `apps/server/`             | Hono API, WebSocket rooms, optional Mongo persistence                |
| `chinese-chess.html`       | Archived single-file prototype (reference only; not the running app) |
| `reference/extracted/`     | Decoded assets from the prototype (gitignored locally)               |

## Multiplayer

1. **Create room** — host gets a `JADE-XXXX` code and shareable URL (`?room=…`).
2. **Join** — guest enters the code; server assigns Black.
3. **Play** — moves sync over WebSocket; server validates with `xiangqi-engine`.
4. **Pass-and-play** — two players on one device; fully client-side.

## Environment variables

One gitignored **`.env`** at the repo root (copy from [`.env.example`](.env.example)). Vite and the Hono server both load it; only `VITE_*` keys are exposed to the browser.

**Server** (no `VITE_` prefix — never exposed to the client)

| Variable                                                          | Default              | Description                                                                                            |
| ----------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `PORT`                                                            | `3001`               | Hono server port                                                                                       |
| `LLM_PROVIDER`                                                    | `gemini`             | LLM backend: `gemini`, `openai`, or `anthropic`                                                        |
| `LLM_MODEL`                                                       | _(provider default)_ | Model id for the active provider                                                                       |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`         | _(unset)_            | API key for the active `LLM_PROVIDER`. Without it, coach uses templates and LLM opponent returns `503` |
| `PLAY_OPPONENT_PROVIDER`                                          | `engine`             | Play vs Computer (`POST /api/opponent/move`): `engine` (Pikafish), `llm`, or `local` (server negamax)  |
| `PIKAFISH_PATH`                                                   | _(unset)_            | Path to Pikafish binary for `POST /api/engine/move`; negamax fallback if missing                       |
| `ENGINE_MOVE_TIMEOUT_MS`                                          | `30000`              | Max wait for a Pikafish move                                                                           |
| `LLM_TIMEOUT_MS`                                                  | `25000`              | Max wait for an LLM response                                                                           |
| `LLM_HISTORY_LIMIT`                                               | `150`                | Max plies in opponent “Recent history” prompt                                                          |
| `LLM_LOG_TOKENS`                                                  | _(dev default)_      | `1` = log token usage; `0` = suppress                                                                  |
| `MONGODB_URI`                                                     | _(unset)_            | Optional MongoDB URI for finished-game persistence; `pnpm dev:docker` sets it to its own container     |
| `MONGODB_DB`                                                      | `jade_court`         | Database name when Mongo is enabled                                                                    |
| `SESSION_SECRET`                                                  | _(unset)_            | Player session HMAC secret (required for register/login in production)                                 |
| `EMAIL_PROVIDER` / `PUBLIC_APP_URL`                               | `console` / dev URL  | Verification and reset links; OAuth redirect base                                                      |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | _(unset)_            | Day-pass Checkout + webhook; all three required to enable billing                                      |
| `STRIPE_E2E_FAKE`                                                 | _(unset)_            | `1` = in-process fake Stripe (no HTTP); auto in `NODE_ENV=test` when Stripe env is set                 |
| `OAUTH_FAKE_ENABLED`                                              | `0`                  | `1` in development only — fake Google/Facebook OAuth without real app credentials                      |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                       | _(unset)_            | Google OAuth (optional)                                                                                |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`                         | _(unset)_            | Facebook Login OAuth (optional)                                                                        |

**Web** (`VITE_*` only)

| Variable       | Default         | Description                                      |
| -------------- | --------------- | ------------------------------------------------ |
| `VITE_WS_URL`  | _(proxy)_       | Override WebSocket URL for production web builds |
| `VITE_API_URL` | _(same origin)_ | Override REST API base URL for production        |

## Implementation status

Core work from [.cursor/plans/jade-court-implementation.md](.cursor/plans/jade-court-implementation.md) is in place: monorepo scaffold, ported engine with tests, full web UI (all five routes), and real-time rooms with server-side move validation.

**Not included yet:** Production deploy pipeline (hosting, Redis for durable rooms, etc.). Playwright E2E covers core flows including the Play with AI journey (`play-ai-journey.spec.ts`).

## Known limitations

- Rooms are **in-memory** — lost on server restart; no Redis yet.
- **Play vs Computer** defaults to Pikafish when `PIKAFISH_PATH` is set; falls back to built-in negamax. **Play with AI** uses the LLM opponent and coach when the active provider’s API key is set (`LLM_PROVIDER`); otherwise templates and local negamax fallback apply.
- MongoDB only persists **finished** online games when `MONGODB_URI` is set.
