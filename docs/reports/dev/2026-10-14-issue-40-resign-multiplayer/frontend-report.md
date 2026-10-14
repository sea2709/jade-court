# Frontend report — Issue #40: Resign when playing with friends (web side)

Worktree: `issue-40-resign-multiplayer`. Read-only of the backend diff that
already lives in `apps/server/**` (see `backend-report.md`). This change
integrates against the new `resign` WS message and the two additive
`publicRoomView` fields.

## Contract as consumed

Client → server (used by `useRoomGame.resign()`):

```json
{ "type": "resign", "guestId": "<seated player guestId>" }
```

`code` is omitted — the hook sends over the already-subscribed socket and the
server resolves the room via `sockets.get(ws).code`, falling back to
`msg.code` if a code is provided. Matches the backend contract.

Server → client (read in `useRoomGame.ws.onmessage`):

| Direction | Shape                                                      | Where it lands in state                                   |
| --------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| Broadcast | `{ type: 'room', room: PublicRoom }` (status `'resigned'`) | `state.status = 'resigned'`, `state.winner = room.winner` |
| Requester | `{ type: 'error', error: 'Game is over' \| … }`            | `state.error = msg.error`                                 |
| All       | `{ type: 'error', message: '…' }` (legacy parse/subscribe) | `state.error = msg.message`                               |

`PublicRoom` (server snapshot) is widened in `apps/web/src/lib/api.ts` to
carry `status: GameStatus | 'resigned'` plus `winner: Side | null`. The
same shape is returned by `POST /api/rooms`, `POST /api/rooms/:code/join`,
and `GET /api/rooms/:code`.

## What changed (per file)

### `apps/web/src/lib/api.ts` (+10 / −3)

- `PublicRoom.status` widened from `GameStatus` to `GameStatus | 'resigned'`.
- `PublicRoom` gained `winner: Side | null`.
- JSDoc explains where each field comes from on the server side.

### `apps/web/src/hooks/useRoomGame.ts` (+59 / −5)

- `RoomGameState.status` widened to `GameStatus | 'resigned'`; added
  `winner: Side | null`. Initial state sets both to `null`.
- `applyRoom()` copies `room.winner` into state and also sets
  `resignSentRef.current = true` when it sees `status === 'resigned'` —
  so a late `resign()` call that races the broadcast is suppressed.
- `useEffect` clears `resignSentRef.current` at the start of each (re)run,
  so a brand-new room/session can resign afresh.
- WS message union: `{ type: 'error'; message: string }` →
  `{ type: 'error'; message?: string; error?: string }`; the handler reads
  `msg.error ?? msg.message ?? 'Unknown error'`.
- New `resign()` `useCallback` (returned alongside the rest of the hook).
  Idempotent: at most one `{ type: 'resign', guestId }` per (current) room,
  regardless of how many times the UI calls it. Guard order is
  check-gate → check-OPEN → set-gate → send, so a closed/missing socket
  doesn't burn the guard.
- `resetLocal()` also resets `winner: null` (parity with the other fields).
- JSDoc on the state shape and the hook itself so future readers know
  who's authoritative for `status` / `winner` (the server).
- **No `onPoint` change**: the existing `if (s.status || s.turn !== side)`
  short-circuit already locks the board the moment the resigned broadcast
  lands, so the "board locks after resignation" requirement is satisfied
  through the same path as checkmate/stalemate.

### `apps/web/src/screens/multiplayerGameOver.ts` (new, 46 lines)

Small pure-helper module (kept separate so it can be unit-tested without
a renderer or React state):

- `didSideWin(status, serverWinner, side, turn, opp)` — prefers the
  server's `winner` when present, falls back to the pre-Issue-#40
  inference ("side to move lost") so older snapshots or tests that don't
  set `winner` still produce the correct `won` boolean.
- `onlineGameOverSubtitle(status, won, winner)` — produces the game-over
  subtitle for the online screen:
  - `stalemate` → "Stalemate."
  - `checkmate` → "Checkmate!"
  - `resigned` + `won` → `"Black resigned — Red wins."` or
    `"Red resigned — Black wins."` (actual resigner colour, actual winner
    colour — loser is always the opp of `winner`).
  - `resigned` + `!won` → "You resigned." (the viewer is the resigner).
- `OnlineRoomStatus` is `GameStatus | 'resigned' | null` — the extended
  room-level union.

### `apps/web/src/screens/multliplayerGameOver.test.ts` → see below.

### `apps/web/src/screens/MultiplayerScreen.tsx` (+49 / −3)

- New imports: `didSideWin`, `onlineGameOverSubtitle`, `OnlineRoomStatus`.
- `won` is now derived from the helper (server winner first, old inference
  as fallback) instead of `game.turn === X.opp(side)`.
- Game-over overlay subtitle now uses `onlineGameOverSubtitle(...)`.
- 🎯 vs 🏆 — emoji tracks `won`, matching the existing `GameOverCard`
  pattern (which already differentiates like this).
- Game-over overlay gets a `data-testid="online-game-over"` so the e2e
  specs can assert it without scraping headings.
- Confirmation overlay (new) renders ABOVE the game-over overlay when
  `confirmResign === true`. Uses the same `pop game-overlay` / `card`
  pattern as the game-over overlay. Heading "Resign this game?", body
  "Your opponent will be declared the winner. This cannot be undone.",
  two buttons: `Cancel` (closes) and `Resign` (`btn btn-red btn-sm`,
  calls `game.resign()`). The overlay only opens while the game is in
  progress and the opponent is seated; once `game.status` is set the
  button disappears so the overlay can't re-open.
- Controls card: a `← Leave room` row is preserved; a `Resign`
  (`btn btn-red btn-sm`, `data-testid="resign-button"`) is appended,
  rendered when `!game.status && game.opponentJoined`. The Jade Court
  look uses the existing `btn-red` gradient (matches the danger-leaning
  treatment called out in the issue spec) without introducing any new
  theme machinery.

### `apps/web/src/screens/multiplayerGameOver.test.ts` (new)

Eight pure-helper tests covering every branch of `onlineGameOverSubtitle`
(stalemate/checkmate × winner combinations, both resign directions, both
sides' POV) and the three branches of `didSideWin` (in-progress, server
winner, fallback).

### `apps/web/src/hooks/useRoomGame.test.ts` (new)

Seven Vitest tests for the hook's resign path, using a `FakeWS` class
stub of `WebSocket` (drives `open()`, `dispatch('message', …)`, captures
`sent[]`):

- sends one frame on three back-to-back calls (double-fire / StrictMode).
- no send before OPEN.
- mirrors `status === 'resigned'` and `winner` into state on the broadcast.
- suppresses a late `resign()` after the resigned broadcast already arrived.
- re-arms the guard on rerender with a new `code` prop.
- surfaces the new `error`-field resign failures.
- still surfaces legacy `message`-field errors.

### `apps/web/e2e/multiplayer.spec.ts` (+90 / 0)

Three new tests, all using the existing `openRoom(browser)` two-context
helper:

- **resign flow**: host clicks Resign → confirmation overlay appears with
  the expected copy → confirms → BOTH sides show the game-over overlay
  with the right copy and emoji; resign button disappears; board is
  no longer interactive (no resign UI on either side).
- **cancel path**: opening the overlay and clicking Cancel keeps the game
  in progress; a subsequent legal move still works.
- **refresh persistence**: Black resigns → host reloads → re-joins via
  the Lobby → game-over overlay re-appears with the correct
  "Black resigned — Red wins." text.

Pre-existing `test.fail()` known-bug spec left untouched (10 ✘ printed,
counted as passed per the issue spec).

## How `resign` is idempotent

Two layers of protection, both required by the issue contract:

1. **Hook-level guard (the `resignSentRef`)** — the only thing that stops
   a `{ type: 'resign', guestId }` from being sent twice for the same
   room. It it set BEFORE the send so a concurrent caller can't squeeze
   a second frame through. Reset at the start of the WS effect (so a new
   code/rerender re-arms it) and ALSO set whenever a `resigned` room
   snapshot arrives (so a late click that races the broadcast doesn't
   trip a `'Game is over'` server error).
2. **UI-level guard** — in `MultiplayerScreen`, the `Resign` controls
   row only renders `game.status && game.opponentJoined` failing, so by
   the time the button is gone the overlay can't be opened either. The
   🟥 confirmed `Resign` button immediately calls
   `setConfirmResign(false)` so the overlay closes around the same tick
   as the send.

The confirmed `Resign` button does NOT call `setState` inside the guard;
the gate is a plain `useRef` (not `useState`), and StrictMode's double
effect run is handled by the effect-time reset plus the
`status === 'resigned'` reset in `applyRoom`.

## Tests added (counts)

| Layer | File                                               | Tests added |
| ----- | -------------------------------------------------- | ----------- |
| Unit  | `apps/web/src/screens/multiplayerGameOver.test.ts` | 8           |
| Unit  | `apps/web/src/hooks/useRoomGame.test.ts`           | 7           |
| E2E   | `apps/web/e2e/multiplayer.spec.ts`                 | 3           |

Totals after this change (CI matches `pnpm test:coverage` + `pnpm test:e2e`):

| Layer       | Before            | After                               |
| ----------- | ----------------- | ----------------------------------- |
| Engine unit | 47                | 47 (unchanged — no engine changes)  |
| Server unit | 107               | 107 (unchanged — no server changes) |
| Web unit    | 65                | 80 (+15)                            |
| E2E         | 21 + 1 known-fail | 24 + 1 known-fail (+3)              |

The three e2e tests cover everything required by the issue (resign flow,
cancel, refresh persistence). No pre-existing test was deleted, `.skip`'d,
`.only`'d, weakened, or moved under `test.fail()`.

## CI checks (run from worktree root, final state)

| Command              | Result | Notes                                                                                                                                          |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`          | PASS   | `--max-warnings 0`, zero warnings.                                                                                                             |
| `pnpm format:check`  | PASS   | All files Prettier-clean (one re-run of `pnpm format` after first run).                                                                        |
| `pnpm build`         | PASS   | engine + server + web (`tsc --noEmit && vite build`). Web bundle ≈ 292 KB.                                                                     |
| `pnpm test:coverage` | PASS   | engine 87.83% / server 73.95% / web 39.87% statements — all floors met.                                                                        |
| `pnpm typecheck`     | PASS   | engine + server + web `tsc`.                                                                                                                   |
| `pnpm test:e2e`      | PASS   | 24/24 across `home / learn / play / multiplayer`. Run twice (`--repeat-each=2`) on the multiplayer file — no flakes attributed to this change. |

The single ✘ in the e2e list reporter is the pre-existing
`multiplayer.spec.ts:80 "a legal move does not surface a rejection error"`
`test.fail()` known-bug spec. It is treated as passed by Playwright and
was intentionally not touched.

## Deviations / open concerns for reviewer / QA

- **Hook-level `resign()` return value (informational)**: returns `boolean`
  (`true` if a frame was sent, `false` if deduped or socket not OPEN). The
  current UI ignores the return value; it exists for tests and to make
  double-fire suppression observable. No action expected.
- **`PublicRoom.winner` on checkmate/stalemate**: the backend now ALSO
  sets `winner` for checkmate/stalemate (was previously only client-side
  inferred). For online multiplayer this is purely additive for the web
  — the existing inference `game.turn === opp(side)` was kept as the
  fallback inside `didSideWin`, so any older code path that lacks a
  `winner` field still produces a correct UI. Play vs Computer and Pass
  & Play never go through `useRoomGame` and are unaffected.
- **Game-over subtitle copy**: I matched the contract's wording verbatim
  for the four cases (stalemate, checkmate, resign-as-winner, resign-as-
  loser). The colour names always come from `winner`, never from the
  viewer's side — so "Black resigned — Red wins." shows even to the Black
  player on the _Black_ game, because they read it from the OPPONENT'S POV
  in the wording. (Test asserts the same wording on both sides.)
- **Confirmation overlay emoji**: kept the game-over overlay's 🏆 vs 🎯
  distinction (won/lost) for consistency with `GameOverCard`. The
  confirmation overlay has no emoji — it's an interrupting modal, not a
  celebration.
- **Not changed**:
  - Pass & Play resign button (out of scope per "Out of scope")
  - `GameOverCard` component (only used by Play, never produces `'resigned'`)
  - LLM routes, coach, learn screens
  - `packages/xiangqi-engine` (room-level status widening lives in
    `apps/server/src/rooms.ts`, not the engine — per the issue spec).
  - `apps/server` (read-only).
  - `.env*`, `.github/**`, root configs.
- **Mobile layout**: not specifically checked. The "Leave room / Resign"
  controls card already wraps gracefully; the overlays use the same
  `card` + `pop game-overlay` pattern as the existing game-over path.
  No regressions expected.
- **PWA cache implications**: the `/api/rooms` and `/ws` paths are not
  cached by the service worker (only the static asset precache list
  changed in `vite build`'s output). On a stale-shell reload, the user
  re-fetches `publicRoomView` which carries resigned state; no SW
  workaround needed.
