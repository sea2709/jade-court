# QA report — Issue #40: Resign when playing with friends

**Verdict: PASS**

End-to-end verification of the resign feature in two real browser sessions driven
against the worktree dev stack (`server :3041`, `web :5213`, no MongoDB / Pikafish /
LLM). Six acceptance criteria all pass with one mobile-layout observation that is
pre-existing (same as PlayScreen / PassPlay at the same breakpoint). The five
adversarial-review minors behave as described — none is worse than documented, and
no new bugs found.

## CI status (from developer reports)

- `pnpm lint`, `format:check`, `build`, `test:coverage`, `typecheck`: all PASS per
  `backend-report.md` and `frontend-report.md`.
- `pnpm test:e2e`: PASS, 24/24. The single ✘ is the pre-existing
  `multiplayer.spec.ts:80 known-bug` `test.fail()` spec (untouched).
- Test-coverage check: 12 new server-side tests (`rooms.test.ts` +5,
  `ws.test.ts` +7), 15 new web-side tests (`multiplayerGameOver.test.ts` +8,
  `useRoomGame.test.ts` +7), 3 new E2E tests in `multiplayer.spec.ts`. All
  required behaviors have a unit or E2E test. No tests deleted, `.skip`-ed,
  `.only`-ed, or weakened.
- LLM / Pikafish / MongoDB features: not configured in this environment.
  Documented as "not testable" per `.agent` guidance — no claim of correctness in
  those areas.

## Per-criterion results

### AC #1 — Either player can resign during an active game, on any turn, after a confirmation overlay

**PASS.** Verified both directions via two real browser sessions.
- `screenshots/02-red-controls-in-progress.png` — Red's controls card shows the
  `Resign` button (red, below `← Leave room`) while it's Red's turn.
- `screenshots/03-black-controls-in-progress.png` — symmetric on the Black side
  while it's Red's turn.
- `screenshots/04-red-confirm-overlay.png` — clicking `Resign` opens a centered
  modal: heading **"Resign this game?"**, body **"Your opponent will be declared
  the winner. This cannot be undone."**, two buttons (`Cancel` / red `Resign`).
  The board is dimmed by `rgba(43, 38, 34, 0.45)`, board is locked.
- Resign on **Red's turn (Red resigns)**: `screenshots/05-red-gameover-you-resigned.png`
  (Red sees 🎯 "You lose" / "You resigned.") and
  `screenshots/06-black-gameover-opponent-resigned.png` (Black sees 🏆 "You win!"
  / "Red resigned — Black wins.").
- Resign on **Black's turn (Black resigns)**: `screenshots/08-black-gameover-you-resigned-on-reds-turn.png`
  (Black sees 🎯 "You lose" / "You resigned.") and
  `screenshots/09-red-gameover-black-resigned-on-reds-turn.png` (Red sees 🏆
  "You win!" / "Black resigned — Red wins.").
- Cancel path verified separately: opening the overlay and clicking `Cancel`
  closes the overlay with no state change; a subsequent legal move
  (`rC [7,1] → [7,4]`) flips the turn to Black successfully.
- Confirmed via `eval`: post-resign `document.querySelectorAll('.piece.clickable').length === 0`
  — board no longer interactive on either side.

### AC #2 — Both clients see the game end right away with the correct winner and reason

**PASS.** See screenshots/5, /6, /8, /9 above. Subtitle text exactly matches the
contract: `"You resigned."` on the resigner's side, `"<LoserColour> resigned —
<WinnerColour> wins."` on the opponent's side. The colour names always come from
`room.winner` (never the viewer's side) — i.e. Red always sees "Black resigned —
Red wins." and Black always sees "Red resigned — Black wins." regardless of who
is the viewer. Verified by direct text inspection of both overlays.

### AC #3 — Moves sent after resignation are rejected by the server ("Game is over")

**PASS.** Verified two ways:
1. **In-UI:** After resign, `evtListener` returned 0 `clickable` pieces; the room
   card on the resigner's screen shows "Game over" pill (text-red-deep). No
   `move_rejected`-style error appears in the room card because the hook's
   `useRoomGame.onPoint` short-circuits on `s.status || s.turn !== side` (the
   board is locked). The move packet is never sent.
2. **Direct WS probe** (`/tmp/opencode/check-board-locked.mjs`): Black sends a
   `move` packet (e.g. `{from:[0,1],to:[2,2]}`) after resign. Server replies:
   ```json
   {"type":"move_rejected","error":"Game is over"}
   ```
   No board mutation (final room board is unchanged from the pre-resign state).

### AC #4 — Resign from spectators / non-seated guestIds, OR after the game has ended, are rejected

**PASS at the protocol level** for the documented cases. The known adversarial
hardening gap from finding #1 (spoofed guestId) is the only divergence and is
NOT a regression — see "Adversarial minors" below.

Verified scenarios (WS probe script in `/tmp/opencode/adversarial-sweep.mjs`):
| # | Scenario | Server response |
|---|----------|-----------------|
| T1 | Spectator with own (non-seated) guestId | `{"type":"error","error":"Not a player in this room"}` ✓ |
| T2 | Spectator spoofing **another** player's guestId | rejected by contract? **NO** — accepted (see adversarial #1) |
| T3 | Spoofed guest after game already ended | `{"type":"error","error":"Game is over"}` ✓ |
| T4 | Properly subscribed red resigns after game already ended | `{"type":"error","error":"Game is over"}` ✓ |
| T5 | Properly subscribed black resigns after game already ended | `{"type":"error","error":"Game is over"}` ✓ |
| T6 | Never-subscribed socket sends resign | `{"type":"error","error":"Not in a room"}` ✓ |

The post-game rejection also means: a spectator subscribing to an already-finished
room and attempting to resign gets `'Game is over'` (not 'Not a player…'), which
is technically correct (the room is over, regardless of who they are). No state
mutation in any of the rejected cases. The unit tests in
`ws.test.ts` ("rejects a resign from a spectator without broadcasting", "rejects
a resign after the game has ended", "rejects resigns from a socket that never
subscribed", "reports unknown rooms for resigns with an explicit bad code")
exercise the same cases and are asserted to pass by the backend report.

### AC #5 — Reconnecting / refreshing after resignation still shows the resigned result

**PASS.** `screenshots/07-red-after-reload-gameover-persists.png`.
After Red reloads `/multiplayer?room=JADE-DKB2`, the page routes back through the
Lobby's `Join` dialog. Clicking `Join game →` re-sends the same guest id, the
server's `subscribe` handler returns the existing room with
`status: 'resigned'` and `winner: 'b'` (verified by reading
`GET /api/rooms/JADE-DKB2`), and the OnlineGame component rehydrates the
`useRoomGame` state with the resigned snapshot. Red sees the game-over overlay
("You lose" / "You resigned.") again — same view as live. The same re-subscribe
path is asserted by `ws.test.ts` "returns the resigned result in the snapshot
when re-subscribing".

### AC #6 — Unit tests cover server-side resign handling, present and asserting

**PASS.** Confirmed by reading the test files (vitest run was not allowed by the
QA-engineer permission scope; developer report claims pass).
- `apps/server/src/rooms.test.ts` (diff lines 134–195) — new `describe('resignRoom', …)`
  block with 4 cases plus a new `publicRoomView` case for resigned state:
  - Red resigns on Black's turn → `winner: 'b'`, `turn` unchanged
  - Black resigns on Red's turn → `winner: 'r'`
  - Unseated guestId → `'Not a player in this room'`, state unchanged
  - Resign after checkmate → `'Game is over'`, winner intact
  - resigned view exposes `status: 'resigned'` + `winner` and is guestId-free
- `apps/server/src/ws.test.ts` — new `describe('room WebSocket resign', …)` block
  with 7 cases covering: success broadcast, spectator rejection (with `silence`
  race asserting no message reaches the seated players), post-game rejection,
  post-resign move rejection, re-subscribe persistence, never-subscribed socket,
  unknown room code. `RoomMsg` type and `silence` helper updated.
- Coverage thresholds met per server report (`server 73.95% / thr. 67`,
  `branches 76.35% / thr. 71`).

## Verified behaviors (additional)

- `PublicRoom` snapshot returned by `POST /api/rooms`, `POST /api/rooms/:code/join`,
  and `GET /api/rooms/:code` all carry `status: GameStatus | 'resigned'` and
  `winner: Side | null`. Verified by direct REST curl of all three endpoints.
- `useRoomGame.resign()` idempotency: at most one `{ type: 'resign', guestId }`
  per current room, regardless of how many times the UI calls it. Verified by
  back-to-back clicks of the Submit button on the confirm overlay
  (`document.querySelectorAll('[data-testid="online-game-over"]')` evaluates the
  same state); the in-progress resign flow uses `setConfirmResign(false)`
  immediately followed by `game.resign()`, and the hook's `resignSentRef` guard
  blocks any subsequent frame. `useRoomGame.test.ts` adds 7 unit tests for this
  path.
- Error-field contract: server error messages from `resign` use the `error` field
  (`{"type":"error","error":"Game is over"}`), distinct from legacy parse/subscribe
  errors which use `message` (`{"type":"error","message":"Invalid message"}`).
  `useRoomGame.ts` reads `msg.error ?? msg.message ?? 'Unknown error'` so both
  parse correctly. Verified by WS probe and by reading the hook.
- No console errors logged by either of the two browser sessions during the
  flows tested (`agent-browser errors` empty, `console` shows Vite hot-reload
  chatter only).
- Server log clean: no exceptions logged during ~50 WS messages across 10+ test
  rooms. Play opponent, Coach, LLM routes not exercised (out of scope for #40).
- Jade Court look (cream background, jade accent, bamboo board, flat pieces) is
  preserved on the online multiplayer screen. The Resign button reuses the
  existing `btn btn-red btn-sm` gradient and the confirm / game-over overlays use
  the same `pop game-overlay` pattern as the existing game-over path. See
  `screenshots/02...06`.

## Adversarial minors — confirmation / observation

These were classified as MINOR by the adversarial review and accepted open items.
QA verified each behaves as described, none is worse than documented.

### Minor #1 — Spectator who knows the seated player's `guestId` can resign on their behalf

**CONFIRMED.** Hardening gap, NOT a regression.
- Probe in `/tmp/opencode/adversarial-sweep.mjs` (T2 case): a fresh spectator
  subscribes to the room (subscription is unauthenticated — `app.ts:117`), then
  sends `{ "type":"resign", "guestId": "<red's-actual-guestId>" }`. Server
  accepts: room flips to `status:'resigned'`, `winner:'b'`, broadcasts to both
  seated players.
- Root cause: `resignRoom(room, msg.guestId)` at
  `apps/server/src/rooms.ts:111-122` compares against `msg.guestId` only, never
  against the socket's `meta.guestId` (set at `app.ts:117`). The pre-existing
  `move` path has the same hook-trust model, so this is consistent with the
  prior trust boundary.
- Mitigating factor: `guestId` is `crypto.randomUUID()` kept in localStorage and
  never returned by any server endpoint (`publicRoomView` is asserted guestId-
  free). An attacker must already know the victim's UUID.
- The hooked-up fix is straightforward (one line — compare against `meta.guestId`)
  and would tighten the trust model. The reviewer chose NOT to make it a fix-now
  bug; consistent with the contract "Re-evaluated as MINOR, accepted open."

### Minor #2 — Resign is accepted before the opponent joins

**CONFIRMED.** Cosmetic state anomaly, NOT a regression.
- Probe in `/tmp/opencode/resign-before-join.mjs`: host creates a room, no one
  joins, host sends `{ type: 'resign', guestId: <host> }` over an already-
  subscribed socket. Server accepts: room state becomes
  `{ status: 'resigned', winner: 'b', redJoined: true, blackJoined: false }`.
- A late joiner (probe step #5) is then seated into the already-resigned room
  with `status: 'resigned'`, `winner: 'b'`, `side: 'b'`. The host UI hides
  the Resign button until `opponentJoined` (`MultiplayerScreen.tsx:108`), so the
  only way to reach this state is via crafted WS, not normal UI flow.
- Suggested fix: reject with `'Game is over'` / clear error when `!room.black`.
  Documented as future hardening.

### Minor #3 — Confirmation overlay stacks on top of game-over overlay

**CONFIRMED visually; part**ially mitigated by hook guard.
- Probe flow:
  1. Red opens the Resign confirmation (`screenshots/04-red-confirm-overlay.png`).
  2. Black resigns via a crafted WS frame (`/tmp/opencode/black-resign2.mjs`).
  3. Red receives the resigned snapshot AND still has the confirm overlay open.
     **Two `.pop.game-overlay` elements visible simultaneously** — the confirm
     sits on top of the game-over.
  4. `screenshots/13-red-overlay-stacking.png` captures this stacking.
  5. Clicking the `Resign` button in the open confirm overlay closes it
     (`setConfirmResign(false)` runs first) and calls `game.resign()` — which
     returns `false` because `resignSentRef.current` was set to `true` when the
     `'resigned'` snapshot was applied. **No spurious error appears in the room
     card.** This is BETTER than the reviewer's worst-case scenario which
     predicted a `"Game is over"` error from a late click — the hook's idempotent
     guard absorbs it.
- Suggested UX fix: auto-close the confirm overlay on incoming `game.status`
  (via `useEffect` keyed on `game.status`). Documented as a follow-up UI tweak;
  not a blocker.

### Minor #4 — Resign is silently dropped when the socket is not OPEN

**NOT REPRODUCED in this run** (pre-existing no-reconnect gap, NOT introduced by
#40). The hook's `resign()` checks `ws.readyState !== WebSocket.OPEN` and returns
`false` silently. Because there's no socket reconnect logic, a user who lost
their connection has no way to resign (or make a legal move) until they manually
refresh. The hook's `useRoomGame.ts:182-189` and the existing `ws.onclose`/`onerror`
handlers are the only relevant paths; nothing in #40 changes them. Out of scope.

### Minor #5 — `saveFinishedGame` failure surfaces a misleading "Invalid message"

**NOT VERIFIED.** MongoDB was not configured in this environment (server log:
"MongoDB skipped (set MONGODB_URI to enable persistence)"), so
`saveFinishedGame` is never called by the resignation path. The path would only
fire if MongoDB is unreachable; cannot test without configuring MongoDB. Per
the adversarial-review suspected behavior, this is consistent with the
pre-existing move-save pattern (`app.ts:143-152`).

## Bugs found by QA

None. All six acceptance criteria pass.

### Observations (non-regression)

- **Mobile 375px viewport, pre-existing layout clipping**: On a 375×812 viewport,
  the `game-layout` grid (`auto 300px`) overflows horizontally — body
  `scrollWidth` ≈ 607px. The center-anchored game-over overlay card
  (`place-items-center` inside `insets-0`) clips at the viewport left edge
  because its parent `.relative` extends past the viewport. Visible in
  `screenshots/12-black-375-gameover.png` — the card shows only "ou lose" and
  "resigned." because the left third is clipped.
  - This is the SAME behavior as the pre-existing `PlayScreen`
    (`game-layout-wide`, `auto 320px`) at the same breakpoint — no `@media`
    rule in `apps/web/src/index.css` switches `game-layout` / `game-layout-wide`
    to single column (only `.learn-layout` does).
  - NOT a regression from #40. The resign feature reuses the existing overlay
    pattern and the underlying layout. Documented here for transparency;
    developer team may want a separate ticket for mobile stacking.
- False claim risk: the front-end tests assert `Cancel` button text and an exact
  `You resigned.` subtitle, with no locale or punctuation variant. If a future
  copy edit changes the strings, the unit tests in
  `apps/web/src/screens/multiplayerGameOver.test.ts` and the Playwright spec in
  `apps/web/e2e/multiplayer.spec.ts` will both start failing — this is intended,
  but worth a heads-up. Not a regression.

## Regression check

- In-progress move flow (`rC [7,1] → [7,4]` then `bC [2,1] → [2,4]`) still works,
  queue of two measured moves, board updated, status remained `null` (verified
  via REST `GET /api/rooms/JADE-ANW6`).
- `applyRoomMove` now sets `room.winner` even on checkmate/stalemate (was
  previously client-side only inferred from `turn === opp(side)`). Verified by
  reading `apps/server/src/rooms.ts:99-103` and the `ws.test.ts:rejects a resign
  from a spectator` fixture ("status='resigned' + winner" assertion). The
  matching client helper `didSideWin` (`apps/web/src/screens/multiplayerGameOver.ts:16-26`)
  prefers `serverWinner` and falls back to the old inference, so older snapshots
  remain correct.
- `pass & play` not exercised — out of scope. No source change in
  `PassPlay`'s game-over or controls; the `useXiangqiGame` hook is untouched.
- `play vs computer` not exercised — out of scope; opponent and engine routes
  are unchanged.
- `learn with AI` not exercised; not changed.

## Not tested

- LLM-driven resign paths (Play vs Computer with `PLAY_OPPONENT_PROVIDER=llm`).
  Not changed in #40; LLM API key not set.
- PikaFish integration. Not changed in #40; `PIKAFISH_PATH` not set.
- MongoDB persistence failure path (Minor #5). MongoDB not configured in this
  environment.
- `vite run vitest` for the new unit tests — the QA engineer's permission scope
  blocks running vitest. Confirmed the test files exist and exercise the right
  paths; trust the developer report that they pass.
- `pnpm test:e2e` runtime — same permission block. Read the e2e specs and matched
  them against my own manual checks; trust the developer's 24/24 result.
- Mobile portrait on a smaller physical device (≤375px) clipping for non-resign
  game-over overlays — exercises pre-existing `PlayScreen` instead of `Multiplayer`'s
  `MultiplayerScreen` only as a cross-reference; not in scope.

## Artifacts

- Report at `docs/reports/qa/2026-10-14-issue-40-resign-multiplayer/report.md`
  (this file).
- Screenshots in `docs/reports/qa/2026-10-14-issue-40-resign-multiplayer/screenshots/`.
- Throw-away probe scripts in `/tmp/opencode/` (NOT shipped with the repo):
  - `move-after-resign.mjs` (single-room move-after-resign)
  - `adversarial-sweep.mjs` (T1–T6 spectator/edge scenarios)
  - `check-board-locked.mjs` (move and resign after resign)
  - `resign-before-join.mjs` (Minor #2 repro)
  - `black-resign.mjs` / `black-resign2.mjs` (helper for stacking repro)
