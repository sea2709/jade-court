---
name: issue-worktree
description: >-
  Creates and uses a git worktree per GitHub issue so parallel Cursor agents do
  not conflict on branches or uncommitted changes. Use when starting work on an
  issue, implementing #N, fixing a GitHub issue, or when multiple agents may
  work on the same repo at once.
---

# Issue worktree workflow

## When to use

- User references a GitHub issue number (`#28`, "implement issue 28").
- Agent is asked to fix, implement, or open a PR for an issue.
- Multiple agents or humans may work on different issues in the same clone.

## Quick start

```bash
./scripts/issue-worktree.sh <issue-number> [short-slug]
cd <printed-path>
./scripts/issue-context.sh <issue-number>
```

Omit `short-slug` when `gh` is available — it is derived from the issue title.

## What the script does

1. Resolves repo root from the current git directory.
2. Creates `../jade-court-worktrees/issue-<n>-<slug>` (sibling to the repo).
3. Creates or attaches branch `issue-<n>-<slug>` from `origin/main` (or `main`).
4. Copies `.env` from the main worktree if the new tree has none.
5. Runs `pnpm install` when `node_modules` is missing.
6. Prints optional dev port offsets (`3001+N`, `5173+N`) for parallel `pnpm dev`.

## Agent obligations

| Do | Don't |
|----|--------|
| `cd` into the worktree before editing | Checkout the issue branch in the main repo tree |
| Commit and push from the worktree | Run `git checkout issue-*` in the primary workspace |
| Use `issue-<n>-slug` branch name | Reuse another issue's worktree for new work |
| Run `pnpm build` / `pnpm test` in the worktree | Assume `node_modules` from main repo applies |

## Full issue flow (with worktree)

1. `gh issue view <n>` and `./scripts/issue-context.sh <n>`
2. `./scripts/issue-worktree.sh <n> [slug]` → `cd` to printed path
3. Implement (minimal diffs; `jade-court.mdc`, `code-comments.mdc`)
4. `pnpm build` / `pnpm test` / manual check
5. Commit: `feat: … (#<n>)`
6. Push (see `git-gh-auth.mdc` if HTTPS fails)
7. `gh pr create` with `Closes #<n>`

## Parallel dev servers

Default ports `:5173` (web) and `:3001` (server) bind one process per machine. When another worktree already runs `pnpm dev`, use the ports from the script output:

```bash
PORT=3031 pnpm --filter @jade-court/server dev
pnpm --filter @jade-court/web dev -- --port 5203
```

## List and inspect worktrees

```bash
git worktree list
```

## Cleanup (after merge)

```bash
git worktree remove ../jade-court-worktrees/issue-<n>-<slug>
git branch -d issue-<n>-<slug>
```

Remove stale worktrees before re-running the script if Git reports a conflict.

## Troubleshooting

| Problem | Action |
|---------|--------|
| `fatal: 'main' is already checked out` | Use worktree script; don't create branch in main tree |
| Worktree path exists but branch wrong | `git worktree list`; remove or reuse path |
| Missing `.env` / LLM keys | Copy from main worktree or `cp .env.example .env` |
| `pnpm` errors in worktree | Run `pnpm install` inside the worktree |

## Related

- [.cursor/rules/github-issues.mdc](../../rules/github-issues.mdc)
- [.cursor/rules/git-gh-auth.mdc](../../rules/git-gh-auth.mdc)
- [AGENTS.md](../../../AGENTS.md)
- [github-workflow.md](../../docs/github-workflow.md)
