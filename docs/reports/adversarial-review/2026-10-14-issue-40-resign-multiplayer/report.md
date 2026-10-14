# Adversarial review — Issue #40: Resign when playing with friends

**Verdict: MINOR ISSUES ONLY**

Reviewed the uncommitted diff in `issue-40-resign-multiplayer` (server `rooms.ts`/`app.ts`, web
`useRoomGame.ts`/`api.ts`/`MultiplayerScreen.tsx`/`multiplayerGameOver.ts`, plus tests). All six
acceptance criteria are met and the core resign flow is correct. The findings below are hardening
gaps and edge cases, none of which is an immediately exploitable or game-breaking bug.

---

## Findings

### 1. Server trusts `msg.guestId` from the message body, not the socket's subscribed identity (spoofing)

- **Severity:** minor (hardening)
- **Location:** `apps/server/src/app.ts:169` (`resignRoom(room, msg.guestId)`)
- **Attack:** A spectator who knows a room code can `subscribe` to it (subscription is
  unauthenticated — any `guestId` is accepted at `app.ts:117`). They then send
  `{ type: 'resign', guestId: <seated player's guestId> }`. `resignRoom` only checks
  `room.red?.guestId === guestId || room.black?.guestId === guestId` (`rooms.ts:116-118`), so a
  spoofed seated `guestId` is accepted and the game ends immediately. The socket's own subscribed
  identity (`meta.guestId`, set at `app.ts:117`) is available but never consulted.
- **Impact:** A spectator (or the opponent) can resign on behalf of the other seat, ending the
  game with a fabricated winner. This is *more* impactful than the equivalent `move` spoof because
  resign is turn-agnostic and needs no legal move.
- **Evidence:** `resignRoom` compares against `msg.guestId` only; the `meta` object fetched at
  `app.ts:158` is used solely for `code` resolution, never for identity.
- **Mitigating factor:** `guestId` is a client-generated `crypto.randomUUID()` (`guestId.ts:6`) and
  is never returned in any server response (`publicRoomView` is guestId-free, asserted in
  `rooms.test.ts`). So this requires the attacker to already know the victim's secret UUID. It is
  also *consistent* with the pre-existing `move` handler (`app.ts:137`), which has the same trust
  model.
- **Suggested fix (backend-developer):** Resolve the resigning player from the socket's subscribed
  identity — use `meta?.guestId` (or reject when `msg.guestId !== meta?.guestId`) instead of
  trusting `msg.guestId` blindly. This is a one-line change and is strictly safer than the `move`
  path; consider applying the same tightening to `move` in a follow-up.

### 2. Resign is accepted before the opponent has joined

- **Severity:** minor
- **Location:** `apps/server/src/rooms.ts:111-122` (`resignRoom`)
- **Attack:** The host creates a room (seated as Red) and, before anyone joins, sends
  `{ type: 'resign', guestId: <host> }` over a subscribed socket. `resignRoom` only checks that the
  guest is seated, not that both seats are filled, so it sets `status: 'resigned'`,
  `winner: 'b'` with `room.black` still `undefined`.
- **Impact:** The room enters a `'resigned'` state with a winner but no opponent. A later joiner
  (`joinRoom`) is seated into a game that is already over, and `publicRoomView` reports
  `winner: 'b'` / `blackJoined: false`. The UI hides the Resign button until `opponentJoined`
  (`MultiplayerScreen.tsx:108`), so this is only reachable via a crafted WS frame, but the server
  should not allow it.
- **Suggested fix (backend-developer):** In `resignRoom`, also reject when `!room.black` (or
  `!room.red`) with a clear error, e.g. `'Not a player in this room'` / `'Game is over'`.

### 3. Confirmation overlay stacks on top of the game-over overlay

- **Severity:** minor
- **Location:** `apps/web/src/screens/MultiplayerScreen.tsx:147-175`
- **Attack:** Open the Resign confirmation, then have the opponent resign (or checkmate) before you
  confirm. `confirmResign` stays `true` while `game.status` becomes set, so both the
  `resign-confirm` overlay and the `online-game-over` overlay render simultaneously (confirm is
  later in the JSX, so it sits on top). Clicking "Resign" now either (a) is suppressed by
  `resignSentRef` if the opponent resigned, or (b) sends a resign the server rejects with
  `'Game is over'` if the game ended by checkmate — surfacing a spurious `Game is over` error in the
  room card.
- **Impact:** Confusing stacked modals and a misleading error string; no state corruption.
- **Suggested fix (frontend-developer):** Close the confirmation overlay when a terminal
  `room.status` snapshot arrives (e.g. reset `confirmResign` in an effect keyed on `game.status`),
  or gate the confirm overlay's render on `!game.status`.

### 4. Resign is silently dropped when the socket is not OPEN (no reconnect)

- **Severity:** minor
- **Location:** `apps/web/src/hooks/useRoomGame.ts:182-189`
- **Attack:** The socket drops (network blip). `ws.onclose` sets `connected: false` but the effect
  never re-runs (deps `[code, guestId, applyRoom]` are stable), so no new WebSocket is created —
  the hook has no reconnect logic (pre-existing). The Resign button remains visible
  (`!game.status && game.opponentJoined`), and clicking through the confirmation calls `resign()`,
  which returns `false` because `ws.readyState !== WebSocket.OPEN`. The overlay closes and nothing
  happens; the user cannot resign and the game is frozen.
- **Impact:** The resign feature exposes the pre-existing "Reconnecting…" dead-end: a user who
  disconnects mid-game cannot resign (or move) until they manually refresh.
- **Suggested fix (frontend-developer):** Out of scope for #40, but worth a follow-up: reconnect the
  socket on `onclose`, or at minimum surface the failed `resign()` (the hook already returns
  `false`) so the UI can tell the user the resign didn't go through.

### 5. `saveFinishedGame` failure surfaces a misleading "Invalid message" after the broadcast

- **Severity:** minor
- **Location:** `apps/server/src/app.ts:177-191`
- **Attack:** With MongoDB configured but unreachable, `saveFinishedGame` throws inside the
  `await`. The `try/catch` around the whole message handler (`app.ts:189-191`) then sends
  `{ type: 'error', message: 'Invalid message' }` to the resigner — *after* `broadcastRoom` already
  delivered the `'resigned'` snapshot.
- **Impact:** The resigner sees the game-over overlay plus a spurious "Invalid message" error in the
  room card. Cosmetic; the game state is already correct. This is the same fire-and-forget pattern
  as the move path (`app.ts:143-152`), so it is pre-existing, not introduced here.
- **Suggested fix (backend-developer):** Wrap `saveFinishedGame` in its own `try/catch` (log and
  swallow) so persistence failures don't masquerade as protocol errors.

---

## Attacked and held

- **Move legality / game-over guard:** moves after resign are rejected with
  `move_rejected 'Game is over'` via the pre-existing `applyRoomMove` status guard (`rooms.ts:83`),
  verified by `ws.test.ts` "rejects moves after a resignation".
- **Double resign / double persist:** `resignRoom` checks `room.status` first (`rooms.ts:115`), and
  the status is set synchronously before any `await`, so two back-to-back resigns (or a resign
  racing a checkmating move) cannot double-write `saveFinishedGame`. Node's single-threaded message
  loop means the critical section is atomic.
- **Winner semantics:** `applyRoomMove` sets `winner = opp(turn)` after the flip (`rooms.ts:103`),
  matching the engine's `gameStatus(board, turn)` (loser = side to move) and the old client
  inference `turn === opp(side)`. `resignRoom` sets `winner = opp(resigning side)`. Both are
  correct and covered by `rooms.test.ts` (checkmate → `'r'`, Red resigns on Black's turn → `'b'`).
- **Spectator using their own guestId:** rejected with `'Not a player in this room'` and no
  broadcast (asserted via the `silence` race in `ws.test.ts`).
- **Malformed frames:** missing `guestId`, wrong-typed `code`/`guestId`, non-JSON, and
  never-subscribed sockets all reply cleanly (`'Not in a room'` / `'Not a player in this room'` /
  `'Invalid message'`) without throwing — the `try/catch` and the `?.toUpperCase()` chain absorb the
  bad shapes.
- **Reconnect/refresh persistence:** re-subscribing returns the `'resigned'` snapshot with
  `winner`, and the client mirrors it (`applyRoom`), so a refresh re-renders the game-over overlay
  (e2e "reloading after a resignation keeps the game-over overlay").
- **Client idempotency:** `resignSentRef` is set before `send`, reset on effect re-run (new code),
  and re-armed by the `'resigned'` snapshot, so double-click / StrictMode double-fire send at most
  one frame (`useRoomGame.test.ts`).
- **Contract drift:** `error ?? message` is read on `type: 'error'` (`useRoomGame.ts:116`), and
  `PublicRoom`/`RoomGameState`/`publicRoomView` all agree on `status: GameStatus | 'resigned'` and
  `winner: Side | null`. No other consumer of `status` (PlayScreen, LearnScreen, GameOverCard,
  PassPlay) is affected — they use `useXiangqiGame`, not `useRoomGame`.

---

## QA hints

1. **Spoofed resign (highest value):** Open a room as host+guest, then open a third browser context
   and `subscribe` to the same code with a fresh guestId. Confirm a resign from that spectator is
   rejected. Then, if you can extract the host's `jade-court-guest-id` from localStorage, send
   `{ type: 'resign', guestId: <host id> }` from the spectator socket and observe that the game ends
   — this demonstrates finding #1 (the server trusts the message body, not the connection).
2. **Resign before opponent joins:** Create a room, do *not* join as guest, and (via devtools WS)
   send a resign as the host. Confirm the room flips to `'resigned'` with `winner: 'b'` and no black
   seat — finding #2.
3. **Overlay stacking:** Open the Resign confirmation on one side, then have the opponent resign
   (or force a checkmate). Confirm both overlays render at once and that clicking "Resign" after a
   checkmate shows a spurious "Game is over" error — finding #3.
4. **Disconnect mid-resign:** Start a game, kill the server's WS connection (or toggle offline),
   then attempt to resign. Confirm the resign is silently dropped and the game is frozen (no
   reconnect) — finding #4.
5. **Persistence failure:** With `MONGODB_URI` pointed at an unreachable host, resign and confirm
   the game-over overlay still appears but an "Invalid message" error is also shown — finding #5.
