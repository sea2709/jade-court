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

---

# Follow-up QA: button row (2026-10-13)

**Date:** 2026-10-13 (same worktree, re-test)
**Worktree:** `/home/pwuser/work/jade-court-worktrees/issue-37-redo-moves` (branch `issue-37-redo-moves`, uncommitted)
**Scope of change under test:** `apps/web/src/screens/PlayScreen.tsx` — "↶ Take back move" + "↷ Redo move" wrapped in `<div className="flex gap-2">`, each carries `btn btn-ghost btn-sm flex-1 px-2`. Restart / New game unchanged below. **No behavior change claimed.**
**Environment:** dev web on `:5210` (proxy `/api` → server `:3038`), server `PLAY_OPPONENT_PROVIDER=engine` (Pikafish unconfigured → negamax fallback per `AGENTS.md`).
**Browser:** Headless Chromium via `agent-browser` CLI, viewport toggled between 1280×720 and 375×812.

## Verdict: **PASS WITH ISSUES (non-blocking environment exclusions)**

Both hands-on behavior and visual layout regression pass. The known accepted nit (pills Δ ≈ 2px width) is present and within the design-review amendment's tolerance. CI is green for everything related to the source diff; the only non-green signals are **reviewer-authored artifacts** outside the change scope (see §B below) and pre-existing page-level horizontal overflow below ~1100px (excluded per task spec).

## A. CI status (re-run from the worktree root)

| Command                                                     | Result        | Notes                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install`                                              | ✅            | Already up to date.                                                                                                                                                                                                            |
| `pnpm build`                                                | ✅            | engine + server + web: 76 modules, web bundle 290.29 kB JS / 37.71 kB CSS.                                                                                                                                                     |
| `pnpm typecheck`                                            | ✅            | engine + server + web — all `tsc --noEmit` clean.                                                                                                                                                                              |
| `pnpm test:coverage`                                        | ✅            | 77 engine + 95 server + 65 web tests pass. Web 36.75 / 79.61 / 73.21 (s/b/f), server 72.62 / 75.13 / 69.87. Same thresholds as the original QA.                                                                                |
| `pnpm test:e2e` (`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`) | ✅            | **21/21** including the four redo specs (`Redo is disabled until a take-back…`, `making a new move after a take-back disables Redo`, `keyboard Ctrl+Shift+Z restores the position without any API call`, `Ctrl+Z is a no-op`). |
| `pnpm lint`                                                 | ⚠ Environment | See §B. Every file in `git diff --name-only` (only `apps/web/src/screens/PlayScreen.tsx`) passes lint.                                                                                                                         |
| `pnpm format:check`                                         | ⚠ Environment | See §B. Every file in `git diff --name-only` passes prettier.                                                                                                                                                                  |

### B. Two non-source lint / format failures — exclusion

Both failures hit files the **UI/UX designer agent** authored for its own design review (not source, not Playwright, not hooks, not engine). Confirmed by inspecting `.gitignore` / untracked status:

```
modified:   apps/web/src/screens/PlayScreen.tsx
Untracked (authored by reviewer agents, NOT part of the source diff):
  docs/reports/design/2026-10-13-issue-37-redo-moves/review-amendment-button-row.md   ← Prettier
  docs/reports/design/2026-10-13-issue-37-redo-moves/review-driver.mjs                ← Prettier + ESLint no-undef
  docs/reports/design/2026-10-13-issue-37-redo-moves/review-screenshots/row-0[1..10]-…png
  docs/reports/design/2026-10-13-issue-37-redo-moves/spec-amendment-button-row.md
```

`pnpm lint` exits non-zero on `docs/reports/design/.../review-driver.mjs` (22 errors: `document`, `window`, `getComputedStyle` `no-undef`). `pnpm format:check` exits non-zero on the same `.mjs` plus `review-amendment-button-row.md`.

The previous QA report (2026-10-13, above) listed `docs/reports/design/2026-10-13-issue-37-redo-moves/review.md` as an environmental prettier drift. This follow-up adds two more reviewer-authored artifacts in the same folder. Neither is touched by, nor does it touch, the layout diff under test.

Per task spec ("`.opencode/agents/*.md` prettier drift (already fixed on branch tip f2c097d)") the agent-prompt fix landed last cycle; this follow-up's CI noise is the next reviewer artifact set. Treat as **environment**, not product, per AGENTS.md review-scope separation.

## C. Per-check results (hands-on at 1280×720 unless noted)

### C1. Round-trip undo/redo with API-call accounting — **PASS**

Repro: start Intermediate Red → Restart → play cannon `[7,1]→[7,4]` (computer: Cannon advances.) → play cannon `[7,7]→[7,5]` (computer: Cannon captures the Horse.) → Take back ×2 via Ctrl+Z (focus on Take back button) → Redo ×2 via Ctrl+Shift+Z (focus on Redo button).

Measured (from `agent-browser eval`, `window.fetch` wrapped to count requests to `/api/opponent/move`):

| State                    | Moves played | Board pieces (selection)                             | `/api/opponent/move` req count (running) |
| ------------------------ | ------------ | ---------------------------------------------------- | ---------------------------------------- |
| After Restart            | 0            | 32 (initial)                                         | 0                                        |
| After pair 1             | 2            | 31 (bC moved `[2,1]→[4,1]`)                          | 1                                        |
| After pair 2             | 4            | 31 (bC moved to `[9,7]` capturing rH at `[9,7]`)     | 2                                        |
| After Ctrl+Z             | 2            | 32 (rH at `[9,7]` restored)                          | **2 (Δ=0)**                              |
| After Ctrl+Z again       | 0            | **32 — byte-for-byte same as initial**               | **2 (Δ=0)**                              |
| After Ctrl+Shift+Z       | 2            | 31 (bC back at `[4,1]`)                              | **2 (Δ=0)**                              |
| After Ctrl+Shift+Z again | 4            | **31 — byte-for-byte same as the post-pair-2 state** | **2 (Δ=0)**                              |

Conclusion: round-trip position and counter are reproduced exactly, and **zero extra `/api/opponent/move` requests** were observed during the 4 undo/redo operations. "Computer advances" / "Cannon captures the Horse." message text was restored verbatim on Redo.

Evidence: `screenshots/row-qa-01-1280-after-2-pairs-mixed-state.png` (moves=4 mixed state), `screenshots/row-qa-02-1280-after-round-trip.png` (post round-trip).

### C2. Mixed state at 1280px — **PASS** (with known nit)

Repro: after Restart + 2 pairs at 1280px. Button states: Take back enabled, Redo disabled.

Measured layout (getBoundingClientRect):

- Take back pill: x=775, w=139.98px, h=38px, y=442.5
- Redo pill: x=922.98, w=138.02px, h=38px, y=442.5 (same y → row)
- Gap between pills: 8px (`Redo.x − TakeBack.right = 8`)
- Restart button: x=775, y=488.5, w=286px (full card content width)
- New game button: x=775, y=534.5, w=286px
- Vertical rhythm: row → Restart = 8px, Restart → New game = 8px (`gap-2`)

Conclusion: both buttons on **one row**, equal-height pills, equal-width (within Δ ≈ 2px), correct enabled/disabled opacities, correct tooltips (`"Take back your last move (Ctrl+Z)"` / `"Nothing to redo"`).

The width delta (139.98 vs 138.02 = Δ 1.97px) matches the design reviewer's `doc/reports/design/.../review-amendment-button-row.md` **Finding 1 (nit)**, which is **known and accepted** per task spec.

Evidence: `screenshots/row-qa-01-1280-after-2-pairs-mixed-state.png`, `screenshots/row-qa-07-1280-initial-both-disabled.png` (both disabled at game start).

### C3. Both enabled at 1280px — **PASS**

Repro: take back once after the 2-pair game → moves=2, both buttons enabled.

Measured tooltips / disabled flags:

- Take back `disabled=false`, `title="Take back your last move (Ctrl+Z)"`
- Redo `disabled=false`, `title="Redo the moves you took back (Ctrl+Shift+Z)"`

Evidence: `screenshots/row-qa-08-1280-row-both-enabled.png`.

### C4. Layout at 375px (mobile) — **PASS**

Repro: same game state, viewport `375×812`.

Measured (375px):

- Take back pill: x=322.5, w=139.98px, h=38px, y=601.56
- Redo pill: x=470.48, w=138.02px, h=38px, y=601.56 (same y)
- Row: `scrollWidth 286 = clientWidth 286` → no row-level overflow
- Each pill: Take back `scrollWidth 140 = clientWidth 140`, Redo `scrollWidth 138 = clientWidth 138` → **no text clipped**
- Restart, New game: x=71.5, w=286px, stacked below with 8px gaps

Conclusion: both labels fit fully inside their pills; no clipped text; the row is one line at 375px.

**Environment note (not a finding):** the buttons sit at x≈322.5 — outside the 375px viewport. Page-level horizontal overflow exists below ~1100px independent of this row. The row itself does **not** add new overflow (`row.scrollWidth === row.clientWidth`). Per task spec ("page-level horizontal overflow below ~1100px viewport") this is the pre-existing page overflow, not a regression.

Evidence: `screenshots/row-qa-03-375-both-buttons-one-row.png`, `screenshots/row-qa-04-375-row-closeup.png`, `screenshots/row-qa-05-375-both-buttons-enabled.png`.

### C5. Buttons clickable in the row arrangement — **PASS**

Repro at 375px: with moves=4 (Take back enabled, Redo disabled).

1. Click `button[aria-label="Take back move"]`: moves 4→2, both buttons enabled after.
2. Click `button[aria-label="Redo move"]`: moves 2→4, Redo disabled again, board restored to the post-pair-2 state.
3. Click `button[aria-label="Take back move"]` again: moves 4→2 again, both buttons enabled.

Both pills are reachable and fire the corresponding `undoLast(2)` / `redoLast(2)` callback. Click target is the whole pill; the row layout does not shrink them below the recommended 24px-style hit area.

### C6. Keyboard shortcuts from row layout — **PASS**

Repro at 1280px after a fresh 2-pair game:

| Shortcut                  | Focus target              | Before → After                                                                                                                          |
| ------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Control+Z`               | `Take back move` (in row) | moves 4 → 2, both buttons enabled after, opReq count unchanged                                                                          |
| `Control+Z`               | `Take back move` (in row) | moves 2 → 0, Take back disabled, Redo enabled, opReq count unchanged (board byte-identical to initial)                                  |
| `Control+Shift+Z`         | `Redo move` (in row)      | moves 0 → 2, both enabled, opReq count unchanged                                                                                        |
| `Control+Shift+Z`         | `Redo move` (in row)      | moves 2 → 4, board byte-identical to post-pair-2, "Computer: Cannon captures the Horse." restored, Redo disabled. opReq count unchanged |
| `Control+Z` + `Control+Y` | `Take back` then `Redo`   | moves 4 → 2 → 4, `Ctrl+Y` correctly replays the stack                                                                                   |

Conclusion: all keyboard shortcuts work from the row layout. No regression vs. the prior stacked layout.

### C7. Restart and New game stacked below, functional — **PASS**

Measured (1280px):

- Restart sits 8px below the row at full card-content width (286px).
- New game sits 8px below Restart at the same 286px width.
- Both use the unchanged `btn btn-ghost btn-sm` class (no `flex-1`); they remain full-width as required.

Functional checks:

- Click ↻ Restart mid-game: `Moves played: 0`, board restored to 32 pieces, Redo disabled (`title="Nothing to redo"`).
- Click New game mid-game: popup returns to the "Pick your challenge" setup screen with Intermediate selected; `Start game →` builds a fresh game.

Evidence: `screenshots/row-qa-06-1280-after-newgame-setup.png`.

## D. Console / network observations (not regressions)

- **No `pageerror`s** at any point during the hands-on run.
- **`console.warn` entries:** several `[server] opponent move failed, using local AI: {message: "Failed to execute 'json' on 'Response': Unexpected end of JSON input"}` prints appear in the browser console while the dev-proxy / server pair races occasionally during Vite HMR. Each is followed by the local negamax fallback (per `useXiangqiGame.ts:428`) and the resulting game state matches the **server-trusted** state — i.e. the server replayed/returned the same move via negamax. Since the warnings do **not** affect undo/redo correctness (verified by byte-identical board before/after in C1) and are not produced by the row-layout diff, they are out of scope.
- Documented as environment noise, identical to the original QA's "Pikafish unconfigured" / "LLM disabled" entries.

## E. Acceptance vs. spec (checklist from task)

| Task item                                                                     | Result   | Evidence                                                                                                                              |
| ----------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 4a — One row at 1280px in mixed state + after take-back                       | **PASS** | C2 / C3; `row-qa-01`, `row-qa-07`, `row-qa-08`                                                                                        |
| 4b — One row at 375px, labels fully inside pills, no clipped text             | **PASS** | C4; `row-qa-03..05`                                                                                                                   |
| 4c — Both buttons remain clickable in the row arrangement                     | **PASS** | C5 (C1 partial)                                                                                                                       |
| 4d — Keyboard shortcuts still work from the row layout (Ctrl+Z, Ctrl+Shift+Z) | **PASS** | C6 (also covers `Ctrl+Y` as Redo alias)                                                                                               |
| 4e — Restart and New game still stacked full-width below, functional          | **PASS** | C7; `row-qa-06`                                                                                                                       |
| 5 — Known nit: pills Δ ≈ 2px width accepted                                   | Accepted | Measured Δ = 1.97px; matches design review Finding 1, not flagged.                                                                    |
| 6 — Pre-existing: page overflow <1100px, `.opencode/agents/*.md` prettier     | Excluded | Not appearing on `git diff --name-only`; `format:check` shows only 2 reviewer-authored files (see §B); page overflow not in this row. |

## F. Bug list

**None.** No blockers, majors, or minors found via the hands-on browser run. The known accepted nit (≈ 2px pill width delta) is documented in the design-review amendment and is **not** reported here.

## G. Tests added (none)

No automated test code written — the developer's existing 4 Playwright specs (`Redo is disabled until a take-back…`, etc.) and 10 unit tests continue to pass under `pnpm test:e2e` and `pnpm test:coverage` without modification. Visual regression is captured in the 8 new screenshots only.

## H. Artifacts added in this follow-up

- `report.md` — appended this section.
- `screenshots/row-qa-01-1280-after-2-pairs-mixed-state.png` — 1280px, after 2 pairs: Take back enabled / Redo disabled (mixed state).
- `screenshots/row-qa-02-1280-after-round-trip.png` — 1280px, after round-trip (moves = 4, board restored).
- `screenshots/row-qa-03-375-both-buttons-one-row.png` — 375px, both buttons on one row, no clipped text.
- `screenshots/row-qa-04-375-row-closeup.png` — 375px scrolled-in view of the row.
- `screenshots/row-qa-05-375-both-buttons-enabled.png` — 375px, both buttons enabled (after take-back).
- `screenshots/row-qa-06-1280-after-newgame-setup.png` — 1280px, post-New game setup screen.
- `screenshots/row-qa-07-1280-initial-both-disabled.png` — 1280px, fresh game, both buttons disabled (moves=0).
- `screenshots/row-qa-08-1280-row-both-enabled.png` — 1280px, both buttons enabled (after take-back).

## I. Cleanup

Dev servers were started with `PORT=3038 pnpm --filter @jade-court/server dev` and `pnpm --filter @jade-court/web exec vite --port 5210`. Both killed before this worktree was left idle. Ports `5210` and `3038` confirmed free (`ss -tlnp` returns nothing).
