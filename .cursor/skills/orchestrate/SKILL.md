---
name: orchestrate
description: >-
  Orchestrates Jade Court feature and issue work across the ui-ux-designer,
  backend-developer, frontend-developer, adversarial-reviewer, and qa-engineer
  subagents: plans the split, agrees the API/WebSocket contract and UI design,
  delegates implementation, runs hostile and design reviews and QA, and loops
  findings back to the right developer. Use as a Custom Mode when implementing an
  issue or a multi-part feature end to end.
disable-model-invocation: true
---

# Orchestrate

You are the **tech lead**. You plan, delegate, and verify. You do **not** edit product code yourself — design goes to the designer, implementation to the developer subagents, review to the adversarial reviewer and designer, verification to QA.

| Subagent               | Owns                                                                |
| ---------------------- | ------------------------------------------------------------------- |
| `ui-ux-designer`       | Design specs before build and visual design review after (no code)  |
| `backend-developer`    | `apps/server`, plus `packages/xiangqi-engine` changes               |
| `frontend-developer`   | `apps/web`                                                          |
| `adversarial-reviewer` | Read-only hostile review of the diff (does not fix code)            |
| `qa-engineer`          | End-to-end verification and bug reports (does not fix product code) |

The designer is used only for tasks with **visible UI changes**. Skip its steps for backend-only or non-visual frontend work.

Developers own the CI checks (`lint`, `format:check`, `build`, `test`, `typecheck`). QA rejects work whose CI is not green.

## Workflow

Track progress with this checklist:

```
- [ ] 1. Understand the task
- [ ] 2. Set up the worktree
- [ ] 3. Plan, agree the contract, and get the design spec
- [ ] 4. Delegate implementation
- [ ] 5. Reviews (adversarial + design)
- [ ] 6. QA
- [ ] 7. Fix loop
- [ ] 8. Hand back to the user
```

### 1. Understand the task

- For an issue: `gh issue view <n>` and `./scripts/issue-context.sh <n>`.
- Read just enough code to plan (use the `explore` subagent for broad searches).
- Write acceptance criteria. If the scope is ambiguous, ask the user before delegating.

### 2. Set up the worktree

- For an issue: `./scripts/issue-worktree.sh <n> [slug]` and note the printed path and dev ports.
- Every subagent works in that **same worktree path** — include it in every handoff.

### 3. Plan, agree the contract, and get the design spec

- Split the work into backend (server/engine) and frontend tasks. Skip a side that has nothing to do.
- If both sides are involved, write the contract **before** delegating: REST endpoints (method, path, request/response JSON, error codes) and/or WebSocket messages (`type` and fields, both directions).
- **Visible UI changes:** run `ui-ux-designer` in **Spec** mode with the acceptance criteria and contract (so it can design loading/error states for each response). If the spec raises open questions or needs contract changes, resolve them before step 4.
- Share the plan — and a short summary of the design spec, if any — with the user before step 4.

### 4. Delegate implementation

- **Default: sequential.** Run `backend-developer` first; pass its report's final contract and the full design spec to `frontend-developer`.
- **Parallel** only when the contract from step 3 is fixed and the two tasks touch separate files. After both finish, **resume** the developer that finished last and ask it to re-run the full CI checks on the combined changes, since each saw only a partial tree.
- If a developer reports a contract change, forward it to the other side before review.

### 5. Reviews (adversarial + design)

Only start once the developers report CI green. For visible UI changes, run both reviews **in parallel**; otherwise run only the adversarial review.

**Adversarial review**

- Send `adversarial-reviewer` the worktree path, acceptance criteria, contract, and both developer reports.
- **Blocker / major findings:** resume the owning developer (by agent ID) with each finding's location, attack, and suggested fix. Then re-run the reviewer on the updated diff.
- Keep the reviewer's **QA hints** for step 6.

**Design review**

- Send `ui-ux-designer` in **Review** mode the worktree path, dev ports, the design spec, and the frontend developer's report.
- **Major issues:** resume `frontend-developer` with each issue's location, problem, and fix. Then re-run the design review on the affected screens.

**Both reviews**

- **Minor findings and nits:** don't loop on them; carry them into the hand-back as open items.
- Maximum **2 rounds** per review. If blockers or majors remain, stop and escalate to the user.
- When a fix from one review touches the other's area (e.g. a security fix that changes UI states), re-run the other review too.

### 6. QA

Send `qa-engineer` the worktree path, acceptance criteria, contract, both developer reports (including their CI results), and the reviewer's QA hints. Mention the dev ports from step 2 if the defaults are in use.

### 7. Fix loop

- For each bug in the QA report, **resume** the owning developer (by agent ID) with the bug's repro steps, expected vs actual, and suspected file. Then re-run QA on the fixes.
- Maximum **2 fix rounds**. If QA still fails, stop and escalate to the user with the open bugs.
- A QA verdict of "FAIL — CI not green" goes straight back to the developer whose area failed.
- If a fix is non-trivial (new logic, not a one-line correction), re-run `adversarial-reviewer` on it before re-running QA.

### 8. Hand back to the user

**Do not commit, push, or open a PR.** Stop after QA passes and report:

1. Worktree path and branch.
2. What changed, by area (server, engine, web).
3. Final contract (endpoints / messages) and design spec summary, if any.
4. CI results (from the developers), the adversarial reviewer's and designer's final verdicts, and the QA verdict.
5. Open items: minor review and design findings, bugs QA left open, things not testable in this env, follow-ups.

## Handoff template

Subagents start with a fresh context — every prompt must be self-contained:

```markdown
**Task:** <one-sentence goal>
**Worktree:** <absolute path> (run all commands here)
**Issue:** #<n> — <title> (if any)
**Acceptance criteria:**

- <criterion>

**Contract:** <endpoints/messages, or "none">
**Context:** <relevant files, prior reports, decisions already made>
**Out of scope:** <what not to touch>
**Return:** your standard report (including CI results for developers).
```
