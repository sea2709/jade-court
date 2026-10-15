# Adversarial review — Issue #49 home demo board

**Date:** 2026-10-14  
**Worktree:** `issue-49-home-demo-board` (uncommitted diff + untracked files)  
**Reviewer:** adversarial-reviewer subagent  

## Verdict

**CHANGES REQUESTED** — One major persistence bug after shape-valid but illegally replayable saves; recommend hardening unbounded replay before merge.

---

## Findings

### 1. Persistence permanently disabled after illegal replay (shape-valid save)

| | |
|---|---|
| **Severity** | **major** |
| **Location** | `apps/web/src/components/HomeDemoBoard.tsx:47-55`, `apps/web/src/hooks/useXiangqiGame.ts:296-299` |
| **Attack** | Set `localStorage['jade-court-home-demo']` to valid v1 JSON whose moves are syntactically valid but not a legal game from the start (e.g. `{ "v": 1, "moves": [{ "from": [7, 1], "to": [0, 0] }] }`, or append an extra ply after a checkmate line). Reload `/`. Play legal moves on the fresh board. Reload again. |
| **Impact** | `parseHomeDemoSave` succeeds; `buildStateFromInitialMoves` rejects and the clear effect removes the bad key (correct). `initialMovesRejected` is set `true` once in `useState` and **never cleared** on `reset()` / Restart / Play again. The save effect bails with `if (game.initialMovesRejected) return`, so **no further moves are written** for the rest of the session. Acceptance criterion #6 (“After every move save…”) fails until a full page reload (empty `initialMoves` → `initialMovesRejected` false). |
| **Evidence** | Save gate: `HomeDemoBoard.tsx` lines 47–55. Sticky flag: `useXiangqiGame.ts` lines 296–299; `RESET` in reducer (line 273–274) does not reset it. Corrupt-JSON path uses `parseOk: false` and empty `initialMoves`, so `initialMovesRejected` stays `false` — only the illegal-replay path triggers the bug. |
| **Suggested fix** | Drop the `initialMovesRejected` guard from the save effect (history length and game state are enough), or reset `initialMovesRejected` when storage is cleared / on `reset()`, or track rejection only for the one-time clear effect via a ref. **Owner:** `frontend-developer`. |

---

### 2. Unbounded `moves` array → self-DoS on mount

| | |
|---|---|
| **Severity** | **major** (hardening; self-inflicted via DevTools) |
| **Location** | `apps/web/src/lib/homeDemoStorage.ts:53-54`, `apps/web/src/hooks/useXiangqiGame.ts:115-147` |
| **Attack** | Store `{ "v": 1, "moves": [ ... ] }` with tens or hundreds of thousands of syntactically valid plies (or a few thousand repeated legal plies). Reload homepage. |
| **Impact** | `parseHomeDemoSave` accepts any array length; `buildStateFromInitialMoves` replays every ply synchronously on the main thread during hook init → long freeze or tab hang. No server involved; still violates “malformed … → fresh game” spirit for abuse-sized payloads. |
| **Suggested fix** | Cap `moves.length` in `parseHomeDemoSave` (e.g. max plies ≤ 500 or 1000 for a demo) and treat overflow as `ok: false`; optionally cap replay in `buildStateFromInitialMoves`. **Owner:** `frontend-developer`. |

---

### 3. `initialMoves` + `aiSide` footgun in shared hook (latent)

| | |
|---|---|
| **Severity** | **minor** |
| **Location** | `apps/web/src/hooks/useXiangqiGame.ts:425-505` |
| **Attack** | Future caller passes both `initialMoves` (restored mid-game) and `aiSide` such that after replay `turn === aiSide`. |
| **Impact** | Opponent-move `useEffect` runs on mount and may issue API/local AI moves without user action — not used by `HomeDemoBoard` today. |
| **Suggested fix** | Document in `GameConfig` JSDoc that `initialMoves` must not be combined with `aiSide`, or skip AI effect until first user interaction. **Owner:** `frontend-developer`. |

---

### 4. Test gap: illegal replay then continued play + reload

| | |
|---|---|
| **Severity** | **minor** (quality / missed regression) |
| **Location** | `apps/web/src/components/HomeDemoBoard.test.tsx` (no case); misleading name in `useXiangqiGame.test.ts:127-131` (“rejects empty” but expects `initialMovesRejected: false`). |
| **Impact** | Finding #1 would not be caught by CI. |
| **Suggested fix** | Add integration test: illegal replay → play one ply → assert `localStorage` updated → reload → position restored. **Owner:** `frontend-developer`. |

---

## Attacked and held

- **Malformed JSON, wrong `v`, non-integer/float coords, missing fields:** `parseHomeDemoSave` returns `ok: false`; effect clears key; fresh board; tests assert no `console.error` / `console.warn` (`HomeDemoBoard.test.tsx:108-118`).
- **`null` / empty string storage:** Treated as empty game (`ok: true`, `moves: []`); no crash.
- **Out-of-board integer coords in JSON:** Pass parse; fail replay; storage cleared; fresh board (persistence bug #1 aside).
- **Extra ply after terminal position:** `buildStateFromInitialMoves` full reject (`useXiangqiGame.ts:116-117`); covered by checkmate fixture + extra move test.
- **No partial replay on first illegal ply:** Entire list rejected — matches spec.
- **Prototype / `__proto__` in JSON:** Parser only reads `v` and `moves`; no assignment to prototypes.
- **`localStorage` throws on read/write/remove:** `safeGetItem` / `safeSetItem` / `safeRemoveItem` swallow errors; gameplay continues (`homeDemoStorage.ts:73-95`, test for `setItem` throw).
- **Move legality on replay:** Each ply checked via `X.movesFrom` and side-to-move (`useXiangqiGame.ts:136-145`).
- **Overlay winner logic:** Stalemate/checkmate fixtures replay to `status` with side to move losing; `redWins = game.status && game.turn === 'b'` matches PassPlay (`MultiplayerScreen.tsx:14-15`, `HomeDemoBoard.tsx:32-33`). Verified offline: stalemate fixture → `status: 'stalemate'`, `turn: 'b'`, `inCheck: false` (231 plies); checkmate → `status: 'checkmate'`, `inCheck: true` (83 plies).
- **Restart disabled with no moves; Play again / Restart clear storage** on happy paths (unit + E2E).
- **StrictMode double mount:** Re-read storage in `useMemo`; clear/save effects idempotent enough; no evidence of clobbering a valid mid-game save before user moves.
- **Shared hook without `initialMoves`:** Existing `useXiangqiGame` tests still pass (29 tests); init path unchanged when `initialMoves` absent/empty.
- **Trust boundaries:** Frontend-only; no server identity or move spoofing scope.
- **Testing.mdc:** No new product-code eslint/ts suppressions observed in diff.

---

## QA hints

1. **Illegal replay persistence (#1):** In DevTools, set `jade-court-home-demo` to `{ "v": 1, "moves": [{ "from": [7,1], "to": [0,0] }] }`, reload, make two legal moves, reload again — **expect** position restored; **currently** expect fresh start (bug).
2. **Corrupt JSON:** `{not json` — fresh board, key removed, no console errors.
3. **Finished game reload:** Load checkmate fixture (or play to mate), reload — overlay + “Red wins!” / “Checkmate!”.
4. **Stalemate copy:** Load stalemate fixture — overlay “Stalemate — no legal moves.” and Red wins (Black to move, no check).
5. **Deselect:** Select Red cannon, click board background (not a square) — selection clears (`onPoint(-1,-1)` via `XQBoard`).
6. **Quota / private mode:** If reproducible, play moves with storage blocked — game should remain playable without throws.
7. **Large array (optional):** Paste save with ~5000 duplicate legal plies — note tab responsiveness on reload.

---

## Scope note

Reviewed uncommitted changes: `HomeDemoBoard.tsx`, `homeDemoStorage.ts`, `HomeScreen.tsx`, `useXiangqiGame.ts`, associated tests, E2E `home.spec.ts`, fixtures. No product code modified by this review.

---

## Re-review 2026-10-14

### Verdict

**APPROVE** — Prior major findings #1 and #2 are addressed; no remaining blocker or major issues. One minor serialize/parse asymmetry worth knowing for QA.

### Status of original findings

| # | Original | After fix |
|---|----------|-----------|
| 1 | Persistence blocked after illegal replay | **Fixed.** Save effect no longer gates on `initialMovesRejected` (`HomeDemoBoard.tsx:47-54`). One-shot bad-save cleanup via `clearedBadSaveRef` + `rejectedOnMount` / `parseOk` (`HomeDemoBoard.tsx:39-45`). Covered by `persists and restores after an illegal-but-valid save is cleared on mount` (`HomeDemoBoard.test.tsx:108-126`). |
| 2 | Unbounded `moves` array DoS | **Fixed.** `HOME_DEMO_MAX_SAVED_PLIES = 1000`; `length > 1000` → `ok: false` before `every(isMoveRecord)` (`homeDemoStorage.ts:57-58`). Test uses 1001 plies (`homeDemoStorage.test.ts:33-40`). |
| 3 | `initialMoves` + `aiSide` footgun | **Mitigated.** JSDoc on `GameConfig.initialMoves` (`useXiangqiGame.ts:33-38`). |
| 4 | Test gap / misleading name | **Fixed.** Integration test added; hook test renamed to “starts from the initial position when initialMoves is an empty array”. |

### New / remaining findings

#### Serialize has no ply cap (reload after 1000+ plies in one session)

| | |
|---|---|
| **Severity** | **minor** |
| **Location** | `homeDemoStorage.ts:66-74` (serialize), `HomeDemoBoard.tsx:47-54` (save effect) |
| **Attack** | In one session without reload, make 1001 legal plies (automation or extreme pass-and-play). Reload. |
| **Impact** | Save effect writes all plies; `parseHomeDemoSave` rejects (`length > 1000`), clear effect removes key, user gets fresh board — silent data loss for pathological length, not tampering. Real games (fixtures ≤231 plies) unaffected. |
| **Suggested fix** | Optional: truncate or reject writes in save effect when `history.length > HOME_DEMO_MAX_SAVED_PLIES`, or cap in `serializeHomeDemoSave`. **Owner:** `frontend-developer` (only if product wants symmetric cap). |

### Fix review (attacks on the patches)

- **StrictMode + `clearedBadSaveRef`:** Ref is per component instance; React StrictMode remount creates a new instance and resets the ref. Illegal/corrupt save: first instance clears storage; remount reads empty/`parseOk: true` and does not need a second clear. Valid mid-game save: clear effect no-ops; save effect may rewrite the same payload — idempotent. `clearedBadSaveRef` only skips duplicate clear **within one mount** when deps are stable — acceptable.
- **Effect ordering:** Clear effect is declared before save effect; on illegal replay `history.length === 0`, save no-ops; clear removes bad key before any write could occur.
- **Restart / Play again after rejected restore:** `restart()` clears storage and `reset()`; save runs on new plies without needing `initialMovesRejected` to flip. Illegal-save test confirms persist + second mount restore without requiring full page reload.
- **1001 ply tampered save:** Fails at parse (`ok: false`), `initialMoves` empty, `rejectedOnMount` false; clear effect still removes key (`!parseOk`). No replay loop on 1001 plies.
- **1000 ply shape-valid illegal replay:** Fails on first illegal ply in `buildStateFromInitialMoves` (one iteration); same cleanup path as single-ply illegal save.
- **1000 vs 1001 boundary:** Test proves 1001 rejected; exactly 1000 syntactically valid entries is accepted by parse (replay cost bounded at ≤1000 steps). No test that 1000 is accepted — low risk.

### Attacked and held (re-review)

- Persistence after bad save then legal play (unit test + code path).
- Parse-time length guard before per-element validation (DoS hardening).
- Corrupt JSON / wrong version / float coords unchanged.
- Overlay, checkmate/stalemate fixtures, shared hook without `initialMoves`.
- No product-code suppressions added in fixes.

### Updated QA hints

1. **Illegal replay then persist (regression for #1):** `{ "v": 1, "moves": [{ "from": [7,1], "to": [0,0] }] }` → reload → play cannon `7-1`→`7-4` → reload → **expect** Black to move and cannon on `7-4`.
2. **1001-ply tamper:** JSON with 1001 identical move objects → reload → fresh board, key cleared, no hang.
3. **1000-ply cap (optional):** Exactly 1000 valid-shaped entries with illegal first ply → fresh board, fast mount (no long replay).
4. **Restart after bad save:** Same as (1) but click **Restart** before playing — still able to save after new moves.
5. **Dev StrictMode (manual):** `pnpm dev`, repeat (1) on `/` — no double-clear race leaving stale bad JSON.
6. **Finished game reload:** Checkmate/stalemate fixtures still show overlay after reload.
7. **Deselect / corrupt JSON / quota:** Same as original QA hints 2, 5–6.
8. **Pathological session length (optional):** If automating 1001 plies in one session, confirm reload resets (minor serialize asymmetry).

### Re-review scope

Re-read `HomeDemoBoard.tsx`, `homeDemoStorage.ts`, `useXiangqiGame.ts` (JSDoc), updated tests; ran unit tests (46 passed in HomeDemoBoard + homeDemoStorage + useXiangqiGame). No product code modified in this re-review.
