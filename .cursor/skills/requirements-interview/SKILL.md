---
name: requirements-interview
description: >-
  Interviews the user in focused rounds until requirements are clear enough to
  implement without guessing, then confirms a written requirements summary
  before any code is written. Use when a request, feature idea, or GitHub issue
  is vague, underspecified, or has open design choices; when the user says
  "interview me", "clarify requirements", "ask me questions first", or "spec
  this out"; or before starting non-trivial work where a wrong assumption would
  cause rework.
---

# Requirements interview

Goal: reach the point where another engineer could implement the request **without asking a single question**, then get the user's explicit sign-off.

## When to use

- The request leaves behavior, scope, or UX open ("add a ranking system", "make the coach better").
- A GitHub issue is thin, or its acceptance criteria are missing or untestable.
- Several reasonable designs exist and choosing wrong means rework.

Skip it for small, unambiguous tasks (typo fixes, a clearly specified bug, a one-line config change). If only one detail is unclear, ask that one question and proceed.

## Workflow

```
- [ ] 1. Research before asking
- [ ] 2. List the unknowns
- [ ] 3. Interview in rounds
- [ ] 4. Check the clarity bar
- [ ] 5. Confirm the requirements summary
```

### 1. Research before asking

Never ask the user something the code, docs, or issue can answer.

- Read the request and any linked issue (`gh issue view <n>`, `./scripts/issue-context.sh <n>`).
- Explore the affected code: existing patterns, similar features, current behavior, tests.
- Note what is already decided by conventions (`AGENTS.md`, `.cursor/rules/`).

Use findings to make questions concrete: "The coach currently streams over SSE from `/api/coach/stream` — should hints use the same stream, or a new endpoint?" beats "How should hints be delivered?"

### 2. List the unknowns

Walk these dimensions and note every gap. Not every dimension applies to every task.

| Dimension      | Questions to resolve                                                      |
| -------------- | ------------------------------------------------------------------------- |
| Goal           | What problem does this solve, and for whom? What does success look like?  |
| Scope          | What is explicitly in? What is explicitly out (or deferred)?              |
| Behavior       | Step-by-step user flow; what happens on each action                       |
| Edge cases     | Errors, empty states, disconnects, invalid input, concurrency, limits     |
| Data/contracts | New or changed API routes, WebSocket messages, persisted fields, env vars |
| UI             | Where it appears, layout, copy, mobile behavior, loading/error states     |
| Constraints    | Performance, security, backward compatibility, cost (e.g. LLM calls)      |
| Acceptance     | Concrete, testable criteria; which unit and E2E tests prove it works      |

Jade Court specifics worth checking: which packages are touched (`xiangqi-engine`, `apps/server`, `apps/web`); whether game rules change (engine only — the server re-validates online moves); which modes are affected (Play, Learn, online rooms); which opponent/LLM providers must support it.

### 3. Interview in rounds

- Use the `AskQuestion` tool. Fall back to a short numbered list in chat only if it is unavailable.
- Ask **1–4 questions per round**, highest-impact first: questions whose answers change the design come before cosmetic ones.
- Prefer multiple choice built from your research. Put the recommended option first and mark it "(Recommended)". The user can always pick "Other".
- One decision per question. No compound questions.
- After each round, briefly state what is now settled, then ask the next round. Follow up immediately on vague answers ("make it fast" → "what latency is acceptable?").
- Don't re-ask anything already answered, and don't ask about details that are cheap to change later — pick a sensible default and list it under Assumptions in the summary.
- If an answer conflicts with an earlier one or with the codebase, point out the conflict and ask which wins.

### 4. Check the clarity bar

Keep interviewing until every item is true:

- [ ] The goal and the user-visible outcome can be stated in one or two sentences.
- [ ] In-scope and out-of-scope items are explicit.
- [ ] Every user flow is described step by step, including error and edge cases.
- [ ] Every new or changed interface (route, message, schema, prop, env var) is named with its shape.
- [ ] Each acceptance criterion is testable — you know which test would verify it.
- [ ] No open question would change the design; remaining choices are low-risk defaults listed as assumptions.

### 5. Confirm the requirements summary

Post this summary in chat and ask the user to confirm or correct it (an `AskQuestion` with "Confirmed — start implementing" / "Needs changes" works well). Do **not** start implementing until the user confirms. If they correct anything, update the summary and confirm again.

```markdown
## Requirements: [feature name]

**Goal:** [one or two sentences: problem, who benefits, outcome]

**In scope**

- ...

**Out of scope**

- ...

**Behavior**

1. [step-by-step flow, including error and edge cases]

**Interfaces**

- [route / WebSocket message / schema / component props / env var, with shape]

**Acceptance criteria**

- [ ] [testable criterion] — verified by [unit test / E2E test / manual check]

**Assumptions** (defaults chosen without asking; easy to change)

- ...

**Affected areas:** [packages and key files]
```

## Anti-patterns

- Dumping a 15-question questionnaire in one message.
- Open-ended questions ("Any other requirements?") when concrete options exist.
- Asking about facts that are in the code or the issue.
- Writing code or creating branches/worktrees before the summary is confirmed.
- Stopping at "mostly clear" — unresolved design-changing questions mean the interview isn't done.
