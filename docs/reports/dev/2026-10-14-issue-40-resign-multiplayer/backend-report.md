# Backend report — Issue #40: Resign when playing with friends (server side)

Worktree: `issue-40-resign-multiplayer`. Server-only change; no engine, web, or env changes.

## What changed

### `apps/server/src/rooms.ts`

- `RoomState.status` widened to `GameStatus | 'resigned'` (room-level union only — the engine's
  `GameStatus` type in `packages/xiangqi-engine` is untouched, per the issue's out-of-scope list).
- `RoomState` gained `winner: Side | null` (null while in progress); `createRoom` initializes it
  to `null`.
- `applyRoomMove` now sets `winner = opp(room.turn)` after the turn flip whenever the engine
  reports game over (checkmate/stalemate). This preserves today's client inference semantics —
  the loser is the side to move — and checkmate/stalemate games now also carry an explicit
  winner.
- New `resignRoom(room, guestId)`:
  - `room.status` truthy → `{ ok: false, error: 'Game is over' }`
  - guestId not the seated Red or Black player → `{ ok: false, error: 'Not a player in this room' }`
  - otherwise `room.status = 'resigned'`, `room.winner = opp(resigning side)` → `{ ok: true }`
  - Deliberately turn-agnostic: either seated player can resign on ANY turn.
- `publicRoomView` gained `winner: room.winner ?? null`; its `status` now carries the extended
  union. Still no guestIds in the view (invariant kept, tested).

### `apps/server/src/app.ts`

- Added `{ type: 'resign'; code?: string; guestId: string }` to the WS client-message union.
- New `resign` handler after the `move` handler. Room resolution mirrors the move guards exactly
  (socket's subscribed room via `sockets.get(ws)` meta, falling back to `msg.code`, uppercased):
  - no room resolvable → `{ type: 'error', error: 'Not in a room' }` to the requesting socket
  - unknown code → `{ type: 'error', error: 'Room not found' }` to the requesting socket
  - `resignRoom` failure → `{ type: 'error', error: 'Game is over' | 'Not a player in this room' }`
    to the requesting socket only (no broadcast)
  - success → `broadcastRoom(room)` to every subscribed socket (same helper as moves), then
    `saveFinishedGame({ ..., status: 'resigned', endedAt: new Date() })` — the same
    broadcast-then-persist pattern as the move path. A `if (room.status)` guard mirrors the move
    path so TypeScript narrows the field; it always passes here (status is `'resigned'`).
- Trailing `return;` added to the end of the `move` block so each dispatch arm exits explicitly
  (no behavior change).
- Updated the `attachRoomSockets` JSDoc to mention resign.

## Contract as implemented (exact shapes)

Client → server (new):

```json
{ "type": "resign", "guestId": "<seated player guestId>", "code": "JADE-XXXX" }
```

- `code` optional: resolved from the socket's subscribed room first, then `msg.code`
  (uppercased), exactly like `move`.

Server → client:

| Case                 | Recipient       | Message                                                                                        |
| -------------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| Success              | all subscribers | `{ type: 'room', room: publicRoomView(room) }` with `status: 'resigned'`, `winner: 'r' \| 'b'` |
| Socket not in a room | requester only  | `{ type: 'error', error: 'Not in a room' }`                                                    |
| Unknown room code    | requester only  | `{ type: 'error', error: 'Room not found' }`                                                   |
| Not a seated player  | requester only  | `{ type: 'error', error: 'Not a player in this room' }`                                        |
| Game already ended   | requester only  | `{ type: 'error', error: 'Game is over' }`                                                     |
| Malformed / non-JSON | requester only  | `{ type: 'error', message: 'Invalid message' }` (existing catch)                               |

Note for the frontend developer: resign failures use the `error` field on `type: 'error'`
(per the approved contract). This differs from the pre-existing `subscribe`/parse errors, which
use the `message` field — check `error` first, then `message`, when displaying WS errors.

`publicRoomView` (in every `room` message, `POST /api/rooms`, `/join`, and
`GET /api/rooms/:code`):

```json
{
  "code": "JADE-XXXX",
  "board": [...],
  "turn": "r" | "b",
  "history": [...],
  "status": null | "checkmate" | "stalemate" | "resigned",
  "winner": null | "r" | "b",
  "redJoined": true,
  "blackJoined": true,
  "redConnected": true,
  "blackConnected": false
}
```

- `winner` is `null` while in progress; for checkmate/stalemate it is the side that delivered
  the end (loser = side to move after the final ply); for `resigned` it is the opponent of the
  resigning player.
- Moves after resignation are rejected by the pre-existing `applyRoomMove` guard with
  `{ type: 'move_rejected', error: 'Game is over' }` — verified by a WS test.
- Re-subscribing after resignation returns the resigned snapshot (status + winner) — verified by
  a WS test.

## Files changed

- `apps/server/src/rooms.ts` — RoomState union + winner, `resignRoom`, `applyRoomMove` winner,
  `publicRoomView` winner.
- `apps/server/src/app.ts` — resign message type + WS handler (guards, broadcast, persistence).
- `apps/server/src/rooms.test.ts` — 5 new tests + 2 updated assertions.
- `apps/server/src/ws.test.ts` — 7 new tests + RoomMsg type/`silence` helper.

No changes to `packages/xiangqi-engine`, `apps/web`, `.env.example` (no new env vars), or root
config.

## Tests

Added 12 tests (all pass without API keys, Pikafish, or MongoDB):

- `rooms.test.ts` → `resignRoom` (4): Red resigns on Black's turn → winner `'b'` (turn left
  untouched); Black resigns on Red's turn → winner `'r'`; unseated guestId →
  `'Not a player in this room'` with state unchanged; resign after checkmate → `'Game is over'`
  with winner intact.
- `rooms.test.ts` → `publicRoomView` (1 new + 1 updated): resigned view exposes
  `status: 'resigned'` + `winner` and stays guestId-free; in-progress view now asserts
  `winner: null`. The existing checkmate test now also asserts `winner: 'r'` (updated because
  `applyRoomMove` sets winner — intentional behavior change per the approved contract).
- `ws.test.ts` (7): both seated clients receive the resign broadcast with the correct winner;
  spectator resign → error to requester only, no broadcast (asserted via a 150 ms `silence`
  race), room unchanged; resign after game over → `'Game is over'`; move after resign →
  `move_rejected 'Game is over'`; re-subscribe after resign → snapshot carries
  `status: 'resigned'` + winner; never-subscribed socket → `'Not in a room'`; explicit bad code
  → `'Room not found'`.

Server suite: 107 tests / 12 files, all passing (was 95 / 12).

Coverage (`pnpm test:coverage`, v8, vs thresholds — none lowered):

| Package | Statements       | Branches         | Functions        | Lines            |
| ------- | ---------------- | ---------------- | ---------------- | ---------------- |
| server  | 73.95% (thr. 67) | 76.35% (thr. 71) | 72.61% (thr. 61) | 73.95% (thr. 67) |
| engine  | 87.83%           | 87.68%           | 81.81%           | 87.83%           |
| web     | 36.75%           | 79.61%           | 73.21%           | 36.75%           |

## CI checks (run from worktree root, final state)

| Command              | Result | Notes                                                                                                                                  |
| -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`          | PASS   | `--max-warnings 0`, zero warnings                                                                                                      |
| `pnpm format:check`  | PASS   |                                                                                                                                        |
| `pnpm build`         | PASS   | First attempt failed (TS2322: `saveFinishedGame.status` needed a non-null string); fixed by mirroring the move path's truthiness guard |
| `pnpm test:coverage` | PASS   | engine + server (107) + web (65) all green; thresholds above                                                                           |
| `pnpm typecheck`     | PASS   | all three packages                                                                                                                     |
| `pnpm test:e2e`      | PASS   | 21/21 (two clean full runs)                                                                                                            |

E2E note: of three full runs, one had a 30 s timeout in
`play.spec.ts:50 "the computer opens when the human plays Black"` — a Play-vs-Computer spec with
no causal path to this diff (it never creates a room or opens a WS). It passed in the other two
full runs and 3/3 times in isolation (`--repeat-each=3`, ~2.9 s each), so I classify it as an
environment/load flake, not a regression. Also: the e2e list reporter prints `✘` for the
`test.fail()` known-bug spec (`multiplayer.spec.ts:80`); it is counted as passed — that mark is
expected and pre-existing.

## Deviations / open concerns

- **WS error field inconsistency (pre-existing, widened by contract):** `subscribe`/parse errors
  send `{ type: 'error', message }` while resign errors send `{ type: 'error', error }`. The
  approved contract specifies the `error` field for resign, so I implemented it exactly; the
  frontend should read `error ?? message` on `type: 'error'`. A future cleanup could unify the
  field name.
- **`winner` on checkmate/stalemate is new:** clients that inferred the winner from
  "side to move lost" keep working (same semantics), and can now read `room.winner` directly.
  `apps/web` types (`apps/web/src/lib/api.ts` RoomView `status: GameStatus`, ~line 25) will need
  `status: GameStatus | 'resigned'` plus `winner: Side | null` — for the frontend developer.
- **Unseat/reconnect edge:** a resigning player who disconnects before the opponent reconnects
  is fine — the result lives in `RoomState`, and re-subscribe returns it (tested). Out-of-scope
  items (draw offers, disconnect forfeit, Play-vs-Computer resign) were not touched.
- No new env vars; no API contract changes beyond the documented WS message and the two additive
  `publicRoomView` fields (`status` union widened, `winner` added).
