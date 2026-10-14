# Frontend report — Issue #37 "Redo taken-back moves in Play vs Computer"

**Scope:** Frontend only (`apps/web/**`).
**Date:** 2026-10-13 (initial) · **Worktree:** `../jade-court-worktrees/issue-37-redo-moves` (branch `issue-37-redo-moves`).
**Plan fidelity:** Implementation matches the approved plan and design spec word-for-word. Two minor recording-only deviations are listed at the end.

> **Note on file location.** This file replaces `docs/reports/qa/2026-10-13-issue-37-redo-moves/frontend-report.md` as the canonical home for the issue #37 frontend deliverable. The original #37 content is preserved verbatim below, then the dated **Follow-up: button row** section documents the layout-only change requested in the 2026-10-13 follow-up.

## Files changed

| File                                        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/hooks/useXiangqiGame.ts`      | Added `redoStack: HistoryEntry[]` to reducer state. `UNDO` now appends removed entries onto `redoStack` in chronological order; `APPLY_MOVE` clears it. Added new `REDO { count }` reducer that atomically replays up to `count` plies from the tail of `redoStack` inside one dispatch (no intermediate React state, so the opponent-move effect never fires mid-replay; never calls `onMove`). Initial state starts with `redoStack: []`. Added `redoLast(count = 1)` to the hook, exposing `redoCount` (= `redoStack.length`).                                                  |
| `apps/web/src/hooks/useXiangqiGame.test.ts` | Added 10 new tests under `describe('useXiangqiGame: redo')`. Adjusted an existing assertion to also assert `redoCount === 2` after a 2-ply take-back. Helper `playComputerRound(result, targetLength, reply)` waits for the FULL round (both plies) to land — `> before` would resolve as soon as the human move lands, so the new signature forces an unambiguous wait.                                                                                                                                                                                                           |
| `apps/web/src/screens/PlayScreen.tsx`       | Added `↷ Redo move` button between `↶ Take back move` and `↻ Restart`. State-dependent tooltip, native `disabled={game.redoCount < 2 \|\| !yourTurn \|\| game.aiThinking}`, `aria-label="Redo move"`. Added `aria-label="Take back move"` and a tooltip on the existing Take back button. Added a window `keydown` listener (mounted only while an active game exists) for `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, and `Ctrl+Y`. Ignores events from `input`, `textarea`, `select`, and `isContentEditable`. Calls `preventDefault()` only when the corresponding action actually fires. |
| `apps/web/src/index.css`                    | Added `.btn:focus-visible { outline: 2px solid var(--jade); outline-offset: 2px; }` in `@layer components`, immediately after `.btn:disabled`, mirroring `.level-card:focus-visible`.                                                                                                                                                                                                                                                                                                                                                                                              |
| `apps/web/e2e/play.spec.ts`                 | Added a nested `describe('Redo taken-back moves')` with four Playwright tests (button lifecycle, new-move clears stack, Ctrl/Cmd+Shift+Z shortcut, no-op Ctrl+Z before any take-back). Updated one existing Playwright matcher for the new `aria-label="Take back move"` accessible name.                                                                                                                                                                                                                                                                                          |

No engine or server touch-points. No new dependencies. No REST/WebSocket contract change.

## Final hook API (delta only)

```ts
useXiangqiGame(config) → {
  …
  undoLast(count = 1): void,          // existing; throws nothing new
  redoLast(count = 1): void,          // NEW — replays `count` plies from redoStack
  redoCount: number,                  // NEW — alias of state.redoStack.length
  …
};
```

- `redoLast` dispatches `{type:'REDO', count}` and immediately calls `setAiThinking(false)` + `clearReveal()` + recomputes `lastOpponentMoveText` from `[...history, ...replay]` via `lastAiMoveText(...)`.
- Safe no-op when `redoStack.length < count` (the reducer clamps `replayCount = Math.min(count, stack.length)`; React renders nothing new).
- In Play, both `undoLast` and `redoLast` MUST change `board`/`turn`/`history`, so the opponent effect's cleanup runs and any in-flight `/api/opponent/move` fetch is discarded via the existing `cancelled` flag.

## Test list

### Unit (`apps/web/src/hooks/useXiangqiGame.test.ts`)

Reuse of the existing `playCentralCannon` helper; new `playComputerRound(result, targetLength, reply?)` helper waits for both plies. New tests (added under `describe('useXiangqiGame: redo')`):

1. `UNDO pushes the removed plies onto the redo stack` — `redoCount` 0→0→2 around one pair.
2. `REDO restores board, turn, lastMove, status, and move count exactly` — full structural round-trip on one pair.
3. `round-trips N× undoLast(2) then N× redoLast(2) back to the original position` — two distinct human moves (central cannon [7,1]→[7,4], then horse [9,1]→[7,2]) so the two pairs don't share the same destination; verifies final board/turn/history match the originals.
4. `a new human move after take-back clears the redo stack` — verifying `redoCount → 0` on the next `APPLY_MOVE`.
5. `RESET clears the redo stack` — verifying `redoCount → 0` along with `history` and `board`.
6. `REDO makes zero opponent API calls and replays the original reply verbatim` — count `fetchMock.mock.calls` before and after; assert no new calls; original `[from, to, side]` and `Coach.describeMove → 'Horse advances.'` text restored; `turn === 'r'` and `aiThinking === false` afterward.
7. `REDO is a safe no-op when fewer plies are stacked than requested` — `redoLast(5)` with stack size 2 still produces the original board.
8. `REDOs ZERO plies when the stack is empty (safe no-op)` — `redoLast(2)` with empty stack is a no-op; no fetch was issued.
9. `discards in-flight opponent requests when UNDO is called mid-fetch` — deferred fetch promise; resolve late after undo; assert history stays at 0 and the cannon is still at [7,1].
10. `does not let the opponent effect fire when REDO leaves turn on the human` — snapshot `fetchMock.mock.calls.length` after redo, cap with `waitFor`, assert no calls were added.

### E2E (`apps/web/e2e/play.spec.ts`)

Nested `test.describe('Redo taken-back moves')`:

- Redo button is disabled until a take-back; after a take-back it enables, restores board + count to 2, surfaces `Computer's last move` and the `computer-lastmove` highlight, and adds **zero** new requests to `/api/opponent/move` (asserted via `page.on('request')`); then disables again.
- A new human move after a take-back disables the Redo button (and resets its tooltip to `Nothing to redo`).
- `Ctrl+Shift+Z` keyboard shortcut restores the position with zero new opponent requests.
- `Ctrl+Z` before any take-back leaves the board unchanged (i.e. nothing fires, browser default is left intact because `canUndo` is false so we don't `preventDefault()`).

### Bug fix woven into the existing E2E test

The pre-existing `'take back undoes both plies'` Playwright test asserts by accessible name `'↶ Take back move'`. The new `aria-label="Take back move"` overrides the accessible name (Playwright matches accessible name, not visual text), so I updated that selector to `'Take back move'`. The behavior under test is unchanged.

## CI results (run from worktree root)

Each command was run after all changes were in place.

| Command              | Result                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`          | ✅ Pass — zero warnings (`--max-warnings 0`).                                                                                                                                                                                                                                                                           |
| `pnpm format:check`  | ⚠ Pre-existing fails: 6 files under `.opencode/agents/*.md` are not prettier-clean. None of these are touched by this task — verified by `git stash` round-trip on the worktree (the same 6 files fail on the unchanged parent commit, see Verification below). All files changed by this task pass `prettier --check`. |
| `pnpm build`         | ✅ Pass — engine, server, and web all build; web bundle: 290.21 kB JS / 37.66 kB CSS.                                                                                                                                                                                                                                   |
| `pnpm typecheck`     | ✅ Pass — packages/xiangqi-engine, apps/server, and apps/web `tsc` all clean.                                                                                                                                                                                                                                           |
| `pnpm test:coverage` | ✅ Pass — 65 web tests + 95 server tests + 77 engine tests, all pass. Web coverage 36.78% / 79.61% / 73.21% / 36.78% (s/br/f/l) vs thresholds 33/74/70/33. Server coverage 72.62% / 75.13% / 69.87% / 72.62% vs thresholds 67/71/61/67. Both above the projected floors.                                                |
| `pnpm test:e2e`      | ✅ Pass — 21/21 (3 home, 4 learn, 5 multiplayer, 9 play including the 4 new redo specs). Playwright browsers installed at `/ms-playwright`; `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` env var was used to point the runner at the existing browser installation.                                                        |

### Verification of the format:check pre-existing fails

```bash
git stash                    # stash all changes
pnpm format:check            # → still fails on exactly those 6 .opencode/agents/*.md files
git stash pop                # restore changes
pnpm format:check            # → same 6 files (none of my files added to the failing set)
```

Per `AGENTS.md`, `.opencode/**` is not in my edit scope. The 6 files were not modified.

## Anything left untested

- The Learn screen gets the Redux behavior for free (because the same hook powers it), but no Learn UI for redo is wired (out of scope per spec §10).
- Multiplayer rooms do not use this hook and are out of scope.
- Mobile / touch interaction: not verified beyond the existing Playwright viewport (1400×1000). Manual spot-check on a real device recommended.
- PWA / offline cache implications: Read-only change to a hook + a button placement; nothing in the Workbox precache manifest changed, no service-worker regeneration concern.

## Deviations from the plan / spec

1. **Existing E2E selector updated.** Adding `aria-label="Take back move"` to the Take back button changes Playwright's accessible-name match — the pre-existing `'take back undoes both plies'` test had to be retargeted to the aria-label. Behaviorally identical.
2. **No new helper for `boardBefore` reuse.** The REDO reducer walks the existing redoStack entries and replays them sequentially via `X.applyMove`, which the engine already performs internally. Extracting an `applyOneEntry` helper would shrink the diff by ~3 lines but add a non-exported internal function with no callers outside the reducer; the current flat `for…of` reads more naturally and matches how `APPLY_MOVE` itself reads. Documented in the `REDO` reducer with a teaching comment explaining the equivalence.
3. **`playComputerRound` test helper signature changed** from `playComputerRound(result)` (implicit `> before`) to `playComputerRound(result, targetLength, reply?)`. First iteration raced with the opponent fetch (the human move alone raises length above 0); the explicit targetLength forces an unambiguous wait. Documented in the helper's JSDoc.

No other deviations. The CSS layer placement, keyboard-shortcut ignore-rules, `preventDefault()` discipline, copy, tooltips, aria-labels, and button order all match spec §4 / §5 / §6 / §8 / §9.

---

## Follow-up: button row (2026-10-13)

**Mode:** Spec amendment. The user requested one layout-only change to `PlayScreen`:

> Put the 2 buttons "Take back move" and "Redo move" on the same row.

Binding design spec: `docs/reports/design/2026-10-13-issue-37-redo-moves/spec-amendment-button-row.md`. **No behavior change**, no engine/server touch, no CSS edit, no token change, no new or retargeted tests.

### Files changed

| File                                                                              | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/screens/PlayScreen.tsx`                                             | In the "Moves played" card, wrap the `<button aria-label="Take back move">` and `<button aria-label="Redo move">` elements in one `<div className="flex gap-2">`. Each of the two buttons gains `flex-1 px-2` (in that order) on top of the existing `btn btn-ghost btn-sm` so the row spans the card content width at 320 − 2×16 = 288 px. Restart + New game remain outside the wrapper as full-width stacked children. All `type`, `disabled` logic, `aria-label`, `title`, `onClick`, and the exact label text "↶ Take back move" / "↷ Redo move" are preserved verbatim. |
| `docs/reports/design/2026-10-13-issue-37-redo-moves/spec-amendment-button-row.md` | `pnpm exec prettier --write` for prettier compliance — content unchanged (the table cells just reflowed inside Prettier's 100-column `printWidth`).                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `docs/reports/dev/2026-10-13-issue-37-redo-moves/frontend-report.md`              | This file. Added the dated **Follow-up: button row** section.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Out of scope (confirmed untouched)

- No edits to `packages/xiangqi-engine` or `apps/server`.
- No edits to any other screen (`LearnScreen`, `MultiplayerScreen`).
- No CSS / token additions or changes. `applyTheme()` unchanged. `.btn:focus-visible`, `.card`, `.game-layout-wide` — all untouched.
- No engine/server helper, no REST/WebSocket contract change.
- Behavior (undo/redo, `canUndo`/`canRedo`, keyboard shortcuts, tooltips, aria-labels, enable/disable conditions) — bit-identical.
- No new unit tests, no new e2e tests, and no e2e selectors retargeted. The existing e2e spec selects by `getByRole('button', { name: 'Take back move' })` / `{ name: 'Redo move' }` — those query the accessible name on the button element itself, which is unchanged by wrapping it in a `<div>`.

### Test outcomes

- All existing tests still pass against the wrapped markup. No assertions were weakened, lowered, deleted, or skipped.
- Hook tests (`useXiangqiGame`): unchanged, covering the redo stack semantics.
- E2E spec `apps/web/e2e/play.spec.ts`: unchanged selectors, unchanged assertions, all 4 redo-related cases (lifecycle / new-move clears / Ctrl+Shift+Z / no-op Ctrl+Z) still green.

### Browser-side verification (manual, no helper committed)

A throwaway Playwright spec was used to drive `/play` at three viewports (375, 768, 1280) and dump rect + state assertions and full-page screenshots; the spec was deleted after the recording. Key position measurements (from the recording):

- At **1280 px** (no horizontal overflow, `pageOverflowX = 0`):
  - card `x=758 y=463 w=320 h=194`, Take back `x=775 y=510 w=142 h=38`, Redo `x=925 y=510 w=136 h=38`, Restart `y=556 w=286`, New game `y=602 w=286`. `takeBackParentTag === redoParentTag === "DIV"` — confirms the wrapping row div.
  - After one human move (mixed state): same `y` for Take back and Redo (588 / 588), `takeBackEnabled=true`, `redoEnabled=false`. Pill widths 142 / 136 — equal within sub-pixel rounding (143 + 8 gap + 135 = 286, card content 288).
  - After undo: `takeBackEnabled=false`, `redoEnabled=true` — correct per `canUndo` / `canRedo` logic.
- At **768 px**: identical structure; same exact pill rects (288 content width fits the same way).
- At **375 px** (pre-existing horizontal overflow, `pageOverflowX = 251`): identical structure; same exact pill rects; labels "↶ Take back move" and "↷ Redo move" both fully visible inside their pills at the narrower width (after restoring `px-2` — keeping `btn-sm`'s `px-4` would have overflowed at 288 px as the spec amendment §2 predicts).

Screenshots confirmed: pills sit on one row at every breakpoint, labels fit, Restart/New game stacked below at full width.

### CI results for this follow-up (this round, worktree root)

| #   | Command              | Result                                                                                                                                                                                                                                                               |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm install`       | ✅ Pass — lockfile already up-to-date; deps resolved without changes.                                                                                                                                                                                                |
| 2   | `pnpm build`         | ✅ Pass — engine (`tsc`) + server (`tsc`) + web (`tsc --noEmit && vite build`) all build. Web bundle: 290.29 kB JS / 37.71 kB CSS (gzip 92.44 / 8.10 kB); PWA precache remains 6 entries / 321.44 KiB.                                                               |
| 3   | `pnpm lint`          | ✅ Pass — zero warnings (`--max-warnings 0`).                                                                                                                                                                                                                        |
| 4   | `pnpm format:check`  | ✅ Pass — no drift. The follow-up formatted the new spec-amendment file via `pnpm exec prettier --write` (table reflow only, content unchanged). Each file I touch passes `prettier --check`.                                                                        |
| 5   | `pnpm typecheck`     | ✅ Pass — packages/xiangqi-engine, apps/server, and apps/web `tsc` all clean.                                                                                                                                                                                        |
| 6   | `pnpm test:coverage` | ✅ Pass — Web 65 tests, Server 95, Engine 77. Coverage vs thresholds: Web 36.75 / 79.61 / 73.21 / 36.75 (s/b/f/l) vs 33 / 74 / 70 / 33; Server 72.62 / 75.13 / 69.87 / 72.62 vs 67 / 71 / 61 / 67; Engine 87.29 / 87.34 / 81.81 / 87.29 (no threshold).              |
| 7   | `pnpm test:e2e`      | ✅ Pass — 21/21 (3 home + 4 learn + 5 multiplayer + 9 play including all 4 redo specs). Playwright browsers at `/ms-playwright` (`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`). All e2e selectors bound by accessible name worked unchanged against the wrapped markup. |

### Anything left open

- Pre-existing horizontal overflow at viewports below ~1100 px is unchanged (out of scope; documented in `spec.md` §10 and spec-amendment §2 as a known characteristic of `.game-layout-wide: auto 320px`). The follow-up did not introduce any new overflow.
- No Learn or Multiplayer redo UI is intended (out of scope per original spec). The hook behavior is shared; the layout change is Play-only.
- No new CSS or token additions — a deliberate constraint per spec amendment §4. If the 375-pixel `↶` glyph ever falls back to a wide symbol-font on a stranger OS, the spec amendment §2 already budgets ~7 px of slack inside the pill; the binding constraint remains the label fit at 288 px, observed green in all three Playwright viewports.

### Deviations from spec amendment

None. The diff implements the spec amendment §1 markup block exactly; `flex-1 px-2` is in the order spec'd; existing `type`, `disabled`, `aria-label`, `title`, `onClick`, and labels are preserved verbatim; Restart and New game remain direct children of the card with the original `gap-2` spacing. No CSS file, token, or other screen was touched.
