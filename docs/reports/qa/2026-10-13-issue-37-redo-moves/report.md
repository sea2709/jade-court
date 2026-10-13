# QA verification — Issue #37 "Redo taken-back moves in Play vs Computer"

**Date:** 2026-10-13  
**Worktree:** `/home/pwuser/work/jade-court-worktrees/issue-37-redo-moves` (branch `issue-37-redo-moves`, uncommitted)  
**Scope:** `apps/web/src/hooks/useXiangqiGame.ts`, `apps/web/src/hooks/useXiangqiGame.test.ts`, `apps/web/src/screens/PlayScreen.tsx`, `apps/web/src/index.css`, `apps/web/e2e/play.spec.ts`  
**Environment:** dev web on `:5210` (proxy `/api` → server `:3038`), server `play_opponent_provider=engine` (Pikafish unconfigured → negamax fallback per `AGENTS.md`).  
**Browser:** Chromium 156.0.8078.4, headless, viewport 1280×900.

## Verdict: **PASS**

All five acceptance criteria pass hands-on, all eight adversarial QA hints pass. CI is green in this worktree. One pre-existing formatting drift (`pnpm format:check` on six `.opencode/agents/*.md` plus two reviewer-authored `docs/reports/.../review|report.md`) is unchanged on the base commit, **not caused by this branch** (verified below). No blockers, no majors found.

---

## 1. CI status (re-run from the worktree root)

| Command                                                     | Result        | Notes                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install`                                              | ✅            | Already up to date.                                                                                                                                                                                                                                    |
| `pnpm build`                                                | ✅            | engine + server + web: 76 modules, web bundle 290.21 kB JS / 37.66 kB CSS.                                                                                                                                                                             |
| `pnpm lint`                                                 | ✅            | ESLint with `--max-warnings 0` clean.                                                                                                                                                                                                                  |
| `pnpm typecheck`                                            | ✅            | `packages/xiangqi-engine`, `apps/server`, `apps/web` — all `tsc --noEmit` clean.                                                                                                                                                                       |
| `pnpm test:coverage`                                        | ✅            | 77 engine + 95 server + 65 web tests pass. Web coverage 36.78 / 79.61 / 73.21 (s/b/f) vs 33/74/70; server 72.62 / 75.13 / 69.87 vs 67/71/61; engine 87.83 / 87.68 / 81.81 (no enforced threshold). Both web and server sit above the projected floors. |
| `pnpm test:e2e` (`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`) | ✅            | **21/21** including the four new redo specs.                                                                                                                                                                                                           |
| `pnpm format:check`                                         | ⚠ Environment | Pre-existing drift — see § 6. **All files changed by this branch (`git diff --name-only`) pass prettier.**                                                                                                                                             |

Verification of the pre-existing `format:check` failure: those exact files were already on disk before the diff. `git diff main...HEAD -- .opencode/agents/*.md` shows zero lines for those files. `git diff --name-only` lists only the five touched source files (all Prettier clean) plus the new untracked `docs/reports/qa/...` artifacts. The two reviewer-authored markdown files fail Prettier too, but they were authored by the adversarial-reviewer / UI-UX-designer agents and are outside this branch's edit scope per `AGENTS.md`.

## 2. Test-coverage review

`git diff main...HEAD -- '*.test.*' '*.spec.*'` shows:

- `apps/web/src/hooks/useXiangqiGame.test.ts`: **+230 lines** — 10 new tests under a new `describe('useXiangqiGame: redo')` block. Plus one extra assertion (`expect(result.current.redoCount).toBe(2)`) appended to the pre-existing "undo of two plies" test.
- `apps/web/e2e/play.spec.ts`: **+94 lines** — 4 new Playwright specs in a new `describe('Redo taken-back moves')`, plus one selector retarget (the pre-existing "take back undoes both plies" test now matches the new `aria-label="Take back move"` instead of `"↶ Take back move"` — documented by developer).

Every new claim in the diff is exercised. No tests were deleted, `.skip`'d, `.only`'d, or weakened.

## 3. Per-criterion results

### AC1 — N× undo then N× redo returns to the original position and count

**PASS.** Played cannon `[7,1]→[7,4]` and then horse `[9,1]→[7,2]` (two distinct pairs, four plies). Snapshot: `Moves played: 4`. Take back × 2 → `Moves played: 0`. Redo × 2 → `Moves played: 4`. `[data-testid=board]` `innerHTML` before and after round-trip is byte-identical. Opponent API calls during the undo + redo cycle: **0**.

Evidence:

- `screenshots/01-roundtrip-before-2pairs.png` — Moves played: 4, "Cannon advances." card, board with the cannon at `[7,4]`.
- `screenshots/02-roundtrip-after-2-undo.png` — Moves played: 0, computer's last move card hidden, board back to the initial position.
- `screenshots/03-roundtrip-after-2-redo.png` — Moves played: 4, card restored, same board as 01.

### AC2 — Redo replays computer's original replies without opponent API call

**PASS.** Captured `request` events to `/api/opponent/move`. After setup + 1 pair: 1 call (the original computer reply). After undo + redo: still 1 call, **delta = 0**. The e2e suite also asserts this and our run shows it locally.

Evidence: AC2 test output `delta=0 (calls before setup=1, after=1)`; `[data-testid=board]` byte-identical across the round trip; card text after redo ("Cannon advances." / "Horse advances.") matches the pre-take-back card text.

### AC3 — New move after take-back clears Redo

**PASS.** After take-back Redo is enabled with tooltip `Redo the moves you took back (Ctrl+Shift+Z)`. After a new move (different piece) Redo is **disabled** with tooltip `Nothing to redo`. The third test in `apps/web/e2e/play.spec.ts:102` ("making a new move after a take-back disables Redo") covers the same path and passes under `pnpm test:e2e`.

Evidence:

- `screenshots/04-after-takeback-redo-enabled.png` — Redo visible (lighter color = enabled but no highlight).
- `screenshots/05-new-move-redo-disabled.png` — same Redo button rendered with native disabled.

### AC4 — Restart and New game clear redo

**PASS.** Take back → `Restart` → `Moves played: 0`, Redo disabled with tooltip `Nothing to redo`. Take back → `New game` → setup screen, no Redo button present (count = 0).

Evidence:

- `screenshots/06-lifecycle-after-takeback.png` and `screenshots/07-lifecycle-after-redo.png` (New-game setup flow).

### AC5 — Unit tests for UNDO/REDO reducer exist and pass

**PASS.** Verbose vitest output shows exactly **10 tests** under `describe('useXiangqiGame: redo')`:

```
✓ … UNDO pushes the removed plies onto the redo stack
✓ … REDO restores board, turn, lastMove, status, and move count exactly
✓ … round-trips N× undoLast(2) then N× redoLast(2) back to the original position
✓ … a new human move after take-back clears the redo stack
✓ … RESET clears the redo stack
✓ … REDO makes zero opponent API calls and replays the original reply verbatim
✓ … REDO is a safe no-op when fewer plies are stacked than requested
✓ … REDOs ZERO plies when the stack is empty (safe no-op)
✓ … discards in-flight opponent requests when UNDO is called mid-fetch
✓ … does not let the opponent effect fire when REDO leaves turn on the human
```

Total file: 24/24 pass (10 redo + 7 vs-computer + 7 two-player). Full verbose log in `unit-test-output.txt`.

## 4. Adversarial QA hints (8 items)

| #   | Hint                                                                                                   | Result                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Redo button lifecycle: disabled → enabled after take-back → disabled after redo, with correct tooltips | **PASS.** Initial `disabled`/`Nothing to redo`; after pair still `Nothing to redo`; after take-back `enabled`/`Redo the moves you took back (Ctrl+Shift+Z)`; after redo `disabled`/`Nothing to redo`. ([screenshots/01..07](screenshots/))                                                                                   |
| 2   | Redo adds zero `/api/opponent/move` requests                                                           | **PASS.** Captured via `page.on('request')`: 1 request for the initial computer reply, **0** during the undo+redo cycle.                                                                                                                                                                                                     |
| 3   | Multi-pair round trip preserves position and count                                                     | **PASS.** 3-pair round trip (cannon, horse, right cannon) → undo × 3 → redo × 3 returns the board to the same `innerHTML`; opponent Δ = 0 ([screenshots/08..09](screenshots/)).                                                                                                                                              |
| 4   | New move clears redo; tooltip returns to "Nothing to redo"                                             | **PASS.** (same as AC3)                                                                                                                                                                                                                                                                                                      |
| 5   | Restart and New game clear redo                                                                        | **PASS.** Restart takes us back to `Moves played: 0` with Redo disabled; New game pops the setup screen.                                                                                                                                                                                                                     |
| 6   | `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl+Y` shortcuts; `Ctrl+Z` with empty stack is a no-op             | **PASS.** Verified in headless via `page.keyboard.press`. `Ctrl+Z` with nothing on stack is a no-op (`Moves played: 0`, board unchanged). `Ctrl+Shift+Z` and `Ctrl+Y` both replay; each leaves 0 new opponent requests ([screenshot/10](screenshots/10-keyboard-shortcuts.png)).                                             |
| 7   | Play as Black: symmetric round trip                                                                    | **PASS.** Computer's opening + human + computer reply = 3 plies. Take back → 1 ply. Redo → 3 plies; `[data-testid=board]` byte-identical; opponent Δ = 0; "Computer's last move / Cannon captures the Horse." card restored verbatim ([screenshots/11..13](screenshots/)).                                                   |
| 8   | Rapid redo card text correctness                                                                       | **PASS.** One pair → take-back → redo once: card text after redo matches the pre-take-back text exactly (`Horse advances.` / `Cannon captures the Horse.`). Stack of 2 plies means the **second** Redo click is properly disabled — extra clicks can't double-replay ([screenshot/14](screenshots/14-rapid-redo-final.png)). |

## 5. Bug list

**None.** No blockers, majors, or minors found via hands-on driving. The advers 1 (odd `count`) and 2 (closure-stale state) findings from the adversarial review are not reachable through `PlayScreen.tsx` (button + shortcut always call `redoLast(2)`; in Play the stack is always even). I confirmed these are theoretically possible only, not observed.

## 6. Environment notes (not bugs)

- **`pnpm format:check` failures.** Eight files fail Prettier in this worktree; none are touched by this branch's source diff:
  - `.opencode/agents/{adversarial-reviewer,backend-developer,frontend-developer,orchestrator,qa-engineer,ui-ux-designer}.md` — pre-existed on the base commit (`76e67b2`), unchanged.
  - `docs/reports/adversarial-review/2026-10-13-issue-37-redo-moves/report.md` and `docs/reports/design/2026-10-13-issue-37-redo-moves/review.md` — authored by the adversarial-reviewer and UI-UX-designer agents, not part of this feature.

  Verified every file in `git diff --name-only` passes prettier:

  ```
  apps/web/e2e/play.spec.ts
  apps/web/src/hooks/useXiangqiGame.test.ts
  apps/web/src/hooks/useXiangqiGame.ts
  apps/web/src/index.css
  apps/web/src/screens/PlayScreen.tsx
  → All matched files use Prettier code style!
  ```

  The developer report mentioned only the six `.opencode/agents/*.md` files; the two reviewer-author files are an additional pre-existing drift not introduced by this branch.

- **Pikafish unconfigured.** Server log shows `[pikafish] not configured, negamax fallback` on every opponent move; this is the documented fallback in `AGENTS.md` and is what `pnpm test:e2e` uses too.

- **LLM disabled.** Server log: `LLM: disabled (set API key for LLM_PROVIDER=gemini — Learn coach and PLAY_OPPONENT_PROVIDER=llm)`. Play opponent has `PLAY_OPPONENT_PROVIDER=engine` so the LLM is irrelevant for this issue; `Learn` AI/coach endpoints are unaffected.

- **Focus-ring rule.** Headless Chromium does not trigger `:focus-visible` on synthetic focus events, so I could not programmatically observe the outline; the rule `.btn:focus-visible { outline: 2px solid var(--jade); outline-offset: 2px; }` is present in the live CSSOM (verified via `document.styleSheets` walk), identical to the pre-existing `.level-card:focus-visible`. The UI/UX reviewer also verified the visible ring in a non-headless browser; treating that as sufficient evidence per the QA scope.

## 7. Tests added (none)

I made no code changes — only added the `docs/reports/qa/.../{report.md, run-qa.mjs, qa-results.json, unit-test-output.txt, screenshots/}` artifacts. The 10 new unit tests and 4 new Playwright tests for redo already shipped with this branch and are credited to the developer.

## 8. Artifacts

- `report.md` — this file.
- `run-qa.mjs` — Playwright-driven QA script (reproduces all 11 evidence checks against a live `:5210` web + `:3038` server stack).
- `qa-results.json` — JSON snapshot of pass/fail per check, console errors, and 4xx/5xx API responses (zero in the final run).
- `unit-test-output.txt` — verbatim `vitest --reporter=verbose` output for `useXiangqiGame.test.ts` (10 redo subtests).
- `screenshots/01..14` — visual evidence per AC and per adversarial hint.

## 9. Cleanup

Dev servers were started with `pnpm --filter @jade-court/server dev` (PORT=3038) and `pnpm exec vite --port 5210` (proxy target `:3038`).

Both must be stopped before the worktree is left idle to avoid port conflicts:

```
kill $(cat $HOME/qa-logs/server.pid) $(cat $HOME/qa-logs/web.pid)
```
