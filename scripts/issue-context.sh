#!/usr/bin/env bash
# Print GitHub issue title, body, and labels for agent context.
# Usage: ./scripts/issue-context.sh <issue-number>

set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: GitHub CLI (gh) is not installed." >&2
  echo "Install: https://cli.github.com/ — then run: gh auth login" >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <issue-number>" >&2
  echo "Example: $0 42" >&2
  exit 1
fi

issue="$1"

if ! [[ "$issue" =~ ^[0-9]+$ ]]; then
  echo "Error: issue number must be numeric (got: $issue)" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

echo "=== Issue #${issue} ==="
echo

gh issue view "$issue" --json title,body,labels,state,url \
  --template $'Title: {{.title}}\nState: {{.state}}\nURL: {{.url}}\nLabels: {{range .labels}}{{.name}} {{end}}\n\n--- Body ---\n{{.body}}\n'
