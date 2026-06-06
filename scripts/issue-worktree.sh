#!/usr/bin/env bash
# Create (or reuse) a git worktree for an issue branch — isolated from other agents.
# Usage: ./scripts/issue-worktree.sh <issue-number> [short-slug]
# Example: ./scripts/issue-worktree.sh 28 multi-llm-provider
#
# Worktrees live in ../jade-court-worktrees/issue-<n>-<slug> (sibling to the repo root).
# Run all edits, commits, pnpm install/build/test/dev from the printed worktree path.

set -euo pipefail

usage() {
  echo "Usage: $0 <issue-number> [short-slug]" >&2
  echo "Example: $0 28 multi-llm-provider" >&2
  exit 1
}

slugify() {
  echo "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g; s/-{2,}/-/g' \
    | cut -c1-48
}

[[ $# -ge 1 ]] || usage
issue="$1"
[[ "$issue" =~ ^[0-9]+$ ]] || { echo "Error: issue number must be numeric (got: $issue)" >&2; exit 1; }

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Error: run from inside the jade-court git repository." >&2
  exit 1
}

slug="${2:-}"
if [[ -z "$slug" ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "Error: short-slug required when gh is not installed." >&2
    usage
  fi
  if ! gh auth status >/dev/null 2>&1; then
    echo "Error: short-slug required when gh is not authenticated." >&2
    usage
  fi
  title="$(gh issue view "$issue" --json title -q .title 2>/dev/null || true)"
  if [[ -z "$title" ]]; then
    echo "Error: could not load issue #$issue; pass short-slug manually." >&2
    exit 1
  fi
  slug="$(slugify "$title")"
fi

branch="issue-${issue}-${slug}"
parent="$(dirname "$REPO_ROOT")/jade-court-worktrees"
wt_path="${parent}/issue-${issue}-${slug}"

mkdir -p "$parent"

git -C "$REPO_ROOT" fetch origin main 2>/dev/null || git -C "$REPO_ROOT" fetch origin 2>/dev/null || true

base_ref="main"
if git -C "$REPO_ROOT" show-ref --verify --quiet refs/remotes/origin/main; then
  base_ref="origin/main"
fi

if [[ -d "$wt_path" ]]; then
  echo "Worktree already exists: $wt_path"
  echo "Branch: $branch"
else
  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$REPO_ROOT" worktree add "$wt_path" "$branch"
    echo "Attached existing branch to new worktree: $wt_path"
  else
    git -C "$REPO_ROOT" worktree add -b "$branch" "$wt_path" "$base_ref"
    echo "Created worktree and branch: $wt_path ($branch from $base_ref)"
  fi
fi

if [[ -f "$REPO_ROOT/.env" && ! -f "$wt_path/.env" ]]; then
  cp "$REPO_ROOT/.env" "$wt_path/.env"
  echo "Copied .env from main worktree."
fi

if [[ ! -d "$wt_path/node_modules" ]]; then
  echo "Running pnpm install in worktree..."
  (cd "$wt_path" && pnpm install)
fi

# Dev port offsets so parallel worktrees do not collide (issue number mod 50).
port_offset=$((issue % 50))
server_port=$((3001 + port_offset))
web_port=$((5173 + port_offset))

echo
echo "=== Issue #$issue worktree ready ==="
echo "Path:   $wt_path"
echo "Branch: $branch"
echo
echo "Next steps (agents: run all git/pnpm commands here, not in the main repo tree):"
echo "  cd \"$wt_path\""
echo "  ./scripts/issue-context.sh $issue"
echo "  pnpm build && pnpm test"
echo
echo "Parallel dev (optional — when another agent uses :5173 / :3001):"
echo "  PORT=$server_port pnpm --filter @jade-court/server dev"
echo "  pnpm --filter @jade-court/web dev -- --port $web_port"
echo
echo "Cleanup after merge:"
echo "  git -C \"$REPO_ROOT\" worktree remove \"$wt_path\""
echo "  git -C \"$REPO_ROOT\" branch -d $branch   # after PR merged"
