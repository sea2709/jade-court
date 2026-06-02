# Agent guide — Jade Court

Instructions for Cursor and other coding agents working in this repository.

## Project overview

Jade Court is a TypeScript monorepo for learning and playing Xiangqi (Chinese chess): React PWA, Hono server, shared rules engine. See [README.md](README.md) for features, stack, and local dev setup.

## Issue-driven workflow

Work from GitHub issues when the user or task references one.

1. **List or view issues** (requires [GitHub CLI](https://cli.github.com/)):
   ```bash
   gh issue list
   gh issue view <n>
   ./scripts/issue-context.sh <n>   # formatted title, body, labels for context
   ```
2. **Branch** from `main`:
   ```bash
   git checkout -b issue-<n>-short-slug
   ```
   Use a short kebab-case slug from the issue title (e.g. `issue-42-fix-room-sync`).
3. **Implement** with minimal, focused diffs. Match existing patterns in touched files.
4. **Commit** with the issue reference:
   ```bash
   git commit -m "fix: describe change (#<n>)"
   ```
   Use conventional prefixes: `fix:`, `feat:`, `docs:`, `chore:`, etc.
5. **Open a PR** that closes the issue (`Closes #<n>` in the body). Follow [.github/pull_request_template.md](.github/pull_request_template.md).

Full human + agent steps: [.cursor/docs/github-workflow.md](.cursor/docs/github-workflow.md).

**Git push in agents:** bare `git push` over HTTPS often fails without a TTY; use `gh auth token` for push or `gh auth setup-git` locally — see [.cursor/rules/git-gh-auth.mdc](.cursor/rules/git-gh-auth.mdc).

## Monorepo commands

Run from the repo root:

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install all workspace dependencies |
| `pnpm build` | Build engine, web, and server |
| `pnpm test` | Run Vitest in packages that define tests |
| `pnpm dev` | Web (:5173) + server (:3001) in parallel |
| `pnpm typecheck` | Typecheck all packages |

Build the engine before first dev run if needed: `pnpm build`.

## Play vs Computer opponent

- **Play:** `aiProvider: 'server'` → `POST /api/opponent/move` (backend from `PLAY_OPPONENT_PROVIDER`: `engine` | `gemma` | `local`).
- **Learn:** `aiProvider: 'gemma'` → `POST /api/ai/move` for the opponent; coach uses `/api/coach/*`.
- **Pikafish:** set `PIKAFISH_PATH` when `PLAY_OPPONENT_PROVIDER=engine`.
- **Fallback:** negamax in `packages/xiangqi-engine` when Pikafish or Gemma fails.
- Install Pikafish from [official-pikafish/Pikafish](https://github.com/official-pikafish/Pikafish/releases) and set `PIKAFISH_PATH` in repo-root `.env`.

## Server debugging (Cursor / VS Code)

Use **Run and Debug** → **Debug Server** (`.vscode/launch.json`). It runs `apps/server` with `tsx`, loads repo-root `.env` via `loadEnv.ts`, and builds `xiangqi-engine` first.

To debug a server already running in a terminal:

```bash
pnpm --filter @jade-court/server dev:debug
```

Then **Attach to Server (9229)**. Stop `pnpm dev` first if port 3001 is in use.

## Environment (single `.env` at repo root)

| File | Used by | Variables |
|------|---------|-----------|
| `.env` (repo root) | Vite / `apps/web` and Hono server | Copy from [`.env.example`](.env.example) |

- **Web** reads `VITE_*` only (exposed in the browser if set).
- **Server** reads the same file at startup (`apps/server/src/loadEnv.ts`); use `GEMINI_API_KEY`, `PORT`, `MONGODB_URI`, etc. **without** a `VITE_` prefix.
- **Gemma opponent:** set `GEMINI_API_KEY` in `.env`; server log should show `Gemma opponent: enabled`. Optional `GEMMA_HISTORY_LIMIT` (default `150`) controls how many plies appear in the opponent prompt.
- Restart `pnpm dev` after editing `.env`.

## Conventions (summary)

- **Game logic** lives only in `packages/xiangqi-engine`. The server re-validates online moves with that package — do not duplicate rules on the server.
- **UI theme** is fixed (Jade Court look); no user theme panel. See `apps/web/src/lib/theme.ts`.
- **Do not edit** `.cursor/plans/` unless the user explicitly asks.
- Prefer focused diffs over broad refactors.
- **Teaching comments** when editing `packages/xiangqi-engine`, `apps/server`, or `apps/web`: follow [.cursor/rules/code-comments.mdc](.cursor/rules/code-comments.mdc) (file headers, JSDoc on exports, section labels on non-obvious logic — not line-by-line noise).

Project rules also live in `.cursor/rules/` (`jade-court.mdc`, `github-issues.mdc`, `code-comments.mdc`).
