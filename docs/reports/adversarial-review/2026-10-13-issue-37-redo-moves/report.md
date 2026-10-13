# Adversarial review — Issue #37 "Redo taken-back moves in Play vs Computer"

**Date:** 2026-10-13
**Worktree:** `../jade-court-worktrees/issue-37-redo-moves` (branch `issue-37-redo-moves`, uncommitted)
**Scope:** `apps/web/src/hooks/useXiangqiGame.ts`, `useXiangqiGame.test.ts`, `screens/PlayScreen.tsx`, `index.css`, `e2e/play.spec.ts`

## Verdict: PASS WITH ISSUES

No blockers or majors. The core reducer logic (UNDO appends to `redoStack`, REDO replays atomically from the tail, APPLY_MOVE/RESET clear the stack) is correct and the round-trip ordering is sound. Findings below are hardening/edge-case items, none reachable through the PlayScreen UI.

---

## Findings

### 1. MINOR — `redoLast` with an odd `count` can leave `turn === aiSide` and fire the opponent effect (violates AC2)

- **Location:** `apps/web/src/hooks/useXiangqiGame.ts:469-487` (`redoLast`) and `:179-214` (REDO reducer).
- **Attack:** Call `redoLast(1)` (the default `count = 1`, or any odd count) when the redo stack holds an odd number of plies. The reducer replays one ply (the human's move), so the final `turn = X.opp(lastApplied.side)` becomes `aiSide`. The opponent effect (`useXiangqiGame.ts:357-437`) then re-runs with `turn === cfg.aiSide` and issues a **new** `/api/opponent/move` fetch — a fresh computer reply, not the original.
- **Impact:** The contract states "Redo must never fire the opponent-move effect, never issue an API call." The atomic single-dispatch prevents _intermediate_ `turn === aiSide` frames, but it does not prevent the _final_ frame from being `aiSide` when the replayed ply count is odd. The original computer reply is not replayed; a new one is fetched.
- **Reachability:** Not reachable from PlayScreen — the button and keyboard shortcut always call `redoLast(2)`, and in Play the stack is always even (undo always removes 2 plies; the game cannot end mid-pair because undo is disabled at game over). Reachable only via direct API misuse (or a future caller such as Learn, which already calls `undoLast(1)` at `LearnScreen.tsx:370` and could later add redo).
- **Suggested fix:** In `redoLast`, clamp `count` to an even number when `cfg.aiSide` is set (e.g. `count = count - (count % 2)`), or have the REDO reducer refuse to end on `aiSide` by replaying one fewer ply. Owner: `frontend-developer`.

### 2. MINOR — `redoLast` computes `lastOpponentMoveText` from closure state that can be stale under same-tick double dispatch

- **Location:** `apps/web/src/hooks/useXiangqiGame.ts:474-484`.
- **Attack:** Two `redoLast(2)` calls in the same synchronous tick (before React re-renders). Both read the same `state.redoStack`/`state.history` from the render closure, so both compute `reapply` as the _same_ tail slice. The reducer itself is correct (it reads fresh state on each dispatch and pops 2 then 2), but the second call's `setLastOpponentMoveText(lastAiMoveText([...state.history, ...reapply], ...))` uses the stale `reapply`, so the "Computer's last move" card can show the wrong ply's description.
- **Impact:** Cosmetic — the board/turn/history are correct; only the "Computer's last move" text can be wrong in a rare race.
- **Reachability:** Not reachable via UI (each click/keydown is a separate task and React flushes between them). Only via programmatic double-call.
- **Suggested fix:** Derive the text from the reducer result instead of recomputing in the callback (e.g. compute `lastOpponentMoveText` in a `useEffect` keyed on `history`), or accept the minor risk. Owner: `frontend-developer`.

### 3. NIT — `Ctrl+Y` triggers redo on macOS

- **Location:** `apps/web/src/screens/PlayScreen.tsx:189`.
- **Attack:** On macOS, pressing `Ctrl+Y` (Control, not Cmd) fires redo. macOS convention is `Cmd+Shift+Z`; `Ctrl+Y` is a Windows/Linux idiom and is unexpected on Mac.
- **Impact:** Harmless extra binding; no wrong behavior, but slightly surprising.
- **Suggested fix:** Gate the `Y` branch on `!navigator.platform.includes('Mac')` or leave as-is (documented). Owner: `frontend-developer`.

### 4. NIT — keyboard listener re-registers on every render

- **Location:** `apps/web/src/screens/PlayScreen.tsx:174-204`.
- **Attack:** The effect deps are `[canUndo, canRedo, game]`. `game` is a fresh object literal returned by `useXiangqiGame` on every render, so the listener is removed and re-added on every render (including during `aiThinking` toggles and reveal pulses).
- **Impact:** No correctness bug (cleanup runs first, no double-listener, no leak). Purely wasteful churn.
- **Suggested fix:** Depend on the specific callbacks (`game.undoLast`, `game.redoLast`) or use a ref for the handlers. Owner: `frontend-developer`.

---

## Attacked and held

- **Cross-batch ordering** (undo 2, undo 2, redo 2, redo 2; and undo 2, redo 2, undo 2): the stack is a LIFO of chronological batches; REDO pops from the tail, so the most-recently-taken-back pair is replayed first and the round-trip restores board/turn/history exactly. Verified against the reducer and test 3.
- **In-flight `/api/opponent/move` during undo/redo:** the opponent effect's `cancelled` cleanup discards late replies; `undoLast`/`redoLast` also call `setAiThinking(false)` + `clearReveal()`. Test 9 covers the deferred-fetch case. In the UI, undo/redo are only enabled on the human's turn (no fetch in flight), so the discard path is defensive but correct.
- **`boardBefore` reuse / custom `startBoard`:** `setBoard` dispatches RESET, which resets `redoStack: []`, so a custom start board cannot coexist with a non-empty redo stack. The pre-existing `UNDO` `keep=0 → X.initialBoard()` quirk is not reachable through redo (and `setBoard` is unused in any screen).
- **Reducer purity / shared `HistoryEntry` objects:** REDO slices new arrays and clones the board; `X.applyMove` clones the board and never mutates `entry.move` (verified `rules.ts:241-248`). Entries shared between `history` and `redoStack` are never mutated.
- **Opponent effect after a normal (even) redo:** redo of 2 plies ends on the human's turn, so the effect's `turn !== aiSide` guard returns early — no fetch. Test 10 and the e2e `page.on('request')` assertion both confirm zero new `/api/opponent/move` calls.
- **Black (human plays second) symmetry:** the history always ends with the computer's reply, so `undoLast(2)` always removes a `[human, computer]` pair and leaves the human's turn; the computer never re-moves after undo, so the redo stack never goes stale. (The `keep=0` computer-removes case is unreachable because Take back is disabled when `history.length < 2`.)
- **Keyboard guard:** input/textarea/select/contentEditable are ignored; `preventDefault` only fires when the action actually runs; the listener lives in PlayScreen's `Game` (not Learn), so it cannot conflict with the coach chat inputs.
- **Test quality:** the 10 unit tests assert real state (board/turn/history/redoCount/fetch-call counts), not just presence; the e2e tests assert the empty square via `[data-square]` count 0 (correct, since empty non-target squares render no `data-square` element) and capture opponent URLs before the redo click.

---

## QA hints

1. **Redo button lifecycle:** start a game, confirm Redo is disabled with tooltip "Nothing to redo"; play a move, confirm still disabled; take back, confirm enabled; redo, confirm board/count/`Computer's last move`/`computer-lastmove` highlight restore and the button disables again.
2. **No API call on redo:** with the Network tab open, take back then redo and confirm no new `POST /api/opponent/move` fires (the e2e test asserts this, but verify manually with a slow network to rule out a race).
3. **Multi-pair round-trip:** play 2+ pairs, take back twice, redo twice, and confirm the position and "Moves played" return exactly to the pre-take-back state.
4. **New move clears redo:** take back, then play a _different_ move, and confirm Redo disables (tooltip "Nothing to redo").
5. **Restart / New game clear redo:** take back (Redo enabled), then press Restart and separately New game, and confirm Redo is disabled in the fresh game.
6. **Keyboard shortcuts:** `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` and `Ctrl+Y` redo; confirm they fire only when the corresponding button is enabled, and that `Ctrl+Z` with nothing to undo does not swallow the browser default.
7. **Play as Black:** start as Black (computer moves first), play a move, take back, redo — confirm the round-trip restores the position and no computer re-move corrupts the redo stack.
8. **Rapid redo:** click Redo twice quickly (or hold `Ctrl+Shift+Z`) and confirm the "Computer's last move" card text stays correct after the stack is exhausted.
