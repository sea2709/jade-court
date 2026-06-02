# Jade Court

**Learn & play Xiangqi** — a TypeScript monorepo with a React PWA for coaching, solo play, lessons, and real-time friend rooms. The shared rules engine runs in the browser and on the server so online moves are validated authoritatively.

For the full roadmap and architecture notes, see [.cursor/plans/jade-court-implementation.md](.cursor/plans/jade-court-implementation.md).

## Features

| Mode | Route | What it does |
|------|-------|-------------|
| **Learn with AI** | `/learn` | Play vs the computer with **Master Lin** coach chat — move grading, hints, and piece tips. With `GEMINI_API_KEY`, coach feedback and hints use **Gemma 4** via the server (`POST /api/coach/*`); piece tips stay instant and local. Falls back to template copy when Gemma is off or unavailable. |
| **Play vs Computer** | `/play` | Same engine and board, lighter UI; beginner / intermediate / advanced difficulty. |
| **Lessons & Puzzles** | `/lessons` | Eight static piece lessons and three tactical puzzles. |
| **Friends** | `/multiplayer` | Create or join a `JADE-XXXX` room over WebSocket, or **pass-and-play** on one device (no server). |

## Stack

| Layer | Technology |
|-------|------------|
| **Web** | React 19, Vite, Tailwind CSS v4, React Router, `vite-plugin-pwa` (installable PWA) |
| **Server** | Hono REST + WebSocket (`ws`), guest sessions via `x-guest-id` |
| **Game logic** | `packages/xiangqi-engine` — rules, negamax AI, coach heuristics, LLM prompt helpers; Vitest golden tests |
| **Rooms** | In-memory store (lost on restart); optional **MongoDB** for finished online games when `MONGODB_URI` is set |

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

### Tests & typecheck

```bash
pnpm test         # xiangqi-engine Vitest suite
pnpm typecheck    # all packages
pnpm build        # engine + web + server
```

## Project structure

| Path | Role |
|------|------|
| `packages/xiangqi-engine/` | Shared Xiangqi rules, AI, coach; used by web and server |
| `apps/web/` | Vite React PWA — screens, board UI, room client |
| `apps/server/` | Hono API, WebSocket rooms, optional Mongo persistence |
| `chinese-chess.html` | Archived single-file prototype (reference only; not the running app) |
| `reference/extracted/` | Decoded assets from the prototype (gitignored locally) |

## Multiplayer

1. **Create room** — host gets a `JADE-XXXX` code and shareable URL (`?room=…`).
2. **Join** — guest enters the code; server assigns Black.
3. **Play** — moves sync over WebSocket; server validates with `xiangqi-engine`.
4. **Pass-and-play** — two players on one device; fully client-side.

## Environment variables

One gitignored **`.env`** at the repo root (copy from [`.env.example`](.env.example)). Vite and the Hono server both load it; only `VITE_*` keys are exposed to the browser.

**Server** (no `VITE_` prefix — never exposed to the client)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Hono server port |
| `GEMINI_API_KEY` | _(unset)_ | Learn coach + opponent (`/api/coach/*`, `/api/ai/move`). Without it, coach uses templates and Gemma opponent is unavailable |
| `PLAY_OPPONENT_PROVIDER` | `engine` | Play vs Computer: `engine` (Pikafish), `gemma`, or `local` (built-in negamax) |
| `PIKAFISH_PATH` | _(unset)_ | Path to Pikafish binary for `POST /api/engine/move`; negamax fallback if missing |
| `ENGINE_MOVE_TIMEOUT_MS` | `30000` | Max wait for a Pikafish move |
| `GEMMA_MODEL` | `gemma-4-26b-a4b-it` | Gemini API model id for opponent moves |
| `GEMMA_TIMEOUT_MS` | `25000` | Max wait for a Gemma move response |
| `GEMMA_HISTORY_LIMIT` | `150` | Max plies (both sides) in Gemma “Recent history” prompt text |
| `GEMMA_LOG_TOKENS` | _(dev default)_ | `1` = log token usage to server console; `0` = suppress; unset follows `NODE_ENV` (`development` logs via `pnpm dev:server`) |
| `MONGODB_URI` | _(unset)_ | Optional MongoDB Atlas URI for finished-game persistence |
| `MONGODB_DB` | `jade_court` | Database name when Mongo is enabled |

**Web** (`VITE_*` only)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_WS_URL` | _(proxy)_ | Override WebSocket URL for production web builds |
| `VITE_API_URL` | _(same origin)_ | Override REST API base URL for production |
| `VITE_PLAY_OPPONENT_PROVIDER` | `engine` | Play vs Computer opponent: `engine`, `gemma`, or `local` |

## Implementation status

Core work from [.cursor/plans/jade-court-implementation.md](.cursor/plans/jade-court-implementation.md) is in place: monorepo scaffold, ported engine with tests, full web UI (all five routes), and real-time rooms with server-side move validation.

**Not included yet:** Playwright end-to-end tests and a production deploy pipeline (hosting, Redis for durable rooms, Clerk auth, etc. remain future items).

## Known limitations

- Rooms are **in-memory** — lost on server restart; no Redis yet.
- **Guest sessions only** — Clerk auth is stubbed for later.
- **No Playwright e2e** in this release.
- **Play vs Computer** defaults to Pikafish when `PIKAFISH_PATH` is set; falls back to built-in negamax. **Learn** uses Gemma coach when `GEMINI_API_KEY` is set.
- MongoDB only persists **finished** online games when `MONGODB_URI` is set.
