# GitHub workflow — Jade Court

Step-by-step guide for humans and coding agents: init the repo, work from issues, open PRs, and rely on CI.

## Prerequisites

- Node.js 20+, pnpm 9+ (see [README.md](../../README.md))
- [GitHub CLI (`gh`)](https://cli.github.com/) for issue-driven development

### Install and auth `gh`

```bash
# Linux (example — see gh docs for your OS)
sudo apt install gh   # or: brew install gh

gh auth login
gh auth status
```

Verify repo access after the remote exists:

```bash
gh repo view
```

## First-time repo setup

From the repo root (already `git init` locally):

```bash
git add .
git commit -m "chore: initial commit"
gh repo create jade-court --private --source=. --remote=origin --push
# Or attach an existing remote:
# git remote add origin git@github.com:OWNER/jade-court.git
# git push -u origin main
```

Replace `OWNER/jade-court` with your GitHub org/user and repo name. After the first push, add a CI badge to [README.md](../../README.md):

```markdown
[![CI](https://github.com/OWNER/jade-court/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/jade-court/actions/workflows/ci.yml)
```

## CI

On every push and pull request to `main`, [.github/workflows/ci.yml](../../.github/workflows/ci.yml) runs:

1. `pnpm install --frozen-lockfile`
2. `pnpm build`
3. `pnpm test`

Node 20; pnpm is enabled via corepack. No `gh` in CI.

## Working an issue (human or agent)

### 1. Find or create an issue

```bash
gh issue list
gh issue list --label bug
gh issue create   # or use GitHub issue forms in the UI
```

### 2. Load issue context

```bash
gh issue view 42
./scripts/issue-context.sh 42
```

Paste script output into an agent chat when helpful.

### 3. Branch

```bash
git checkout main
git pull
git checkout -b issue-42-fix-room-sync
```

Naming: `issue-<number>-<short-slug>`.

### 4. Implement and verify

```bash
cp .env.example .env   # add GEMINI_API_KEY for Gemma opponent
pnpm build
pnpm test
pnpm dev    # manual check when UI or multiplayer changes
```

Restart `pnpm dev` after env changes. Server log: `Gemma opponent: enabled` when `GEMINI_API_KEY` is in repo-root `.env`.

Follow [AGENTS.md](../../AGENTS.md) and `.cursor/rules/` for monorepo conventions.

### 5. Commit

```bash
git add -A
git commit -m "fix: sync board state after reconnect (#42)"
```

Reference the issue number in the message: `(#42)`.

### 6. Push and open PR

```bash
git push -u origin issue-42-fix-room-sync
gh pr create --fill
```

Fill in [.github/pull_request_template.md](../../.github/pull_request_template.md). Link the issue:

```markdown
Closes #42
```

### 7. Review and merge

After CI passes, merge on GitHub. Delete the branch when done.

## Quick reference

| Task | Command |
|------|---------|
| List open issues | `gh issue list` |
| View one issue | `gh issue view <n>` |
| Issue context for agents | `./scripts/issue-context.sh <n>` |
| Create PR | `gh pr create` |
| Check PR CI | `gh pr checks` |

## Agent entry points

- [AGENTS.md](../../AGENTS.md) — agent instructions at repo root
- `.cursor/rules/github-issues.mdc` — always-on issue workflow rule
- `.cursor/rules/jade-court.mdc` — project conventions
