# Jade Court — Cursor workspace config

Project-level Cursor configuration for this repo. Global Cursor settings (user preferences, installed skills, etc.) stay in `~/.cursor`; this folder is **workspace-only** and is committed to the repo.

## Contents

| Path | Purpose |
|------|---------|
| `plans/` | Implementation plans and architecture notes |
| `rules/` | Cursor agent rules (`.mdc` files) that guide AI behavior in this project |
| `docs/` | Human and agent workflow docs (see below) |

## plans/

Long-form planning documents. The main roadmap is [`plans/jade-court-implementation.md`](plans/jade-court-implementation.md).

## rules/

`.mdc` rule files with YAML frontmatter. Rules can apply always or only when matching files are open. See [`rules/jade-court.mdc`](rules/jade-court.mdc) for project conventions, [`rules/github-issues.mdc`](rules/github-issues.mdc) for issue-driven development, and [`rules/code-comments.mdc`](rules/code-comments.mdc) for teaching comments in engine/server/web code.

## docs/

Step-by-step GitHub and issue workflow for humans and agents: [`docs/github-workflow.md`](docs/github-workflow.md). Related: repo-root [`AGENTS.md`](../AGENTS.md) and [`scripts/issue-context.sh`](../scripts/issue-context.sh).
