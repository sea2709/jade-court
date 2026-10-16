/**
 * Pure helpers for the multiplayer game-over overlay.
 *
 * Kept in their own module so the side/resigner/loser labelling can be unit
 * tested without a renderer or React state. Only used by
 * `MultiplayerScreen` for the online (`useRoomGame`) path; the local/pass
 * screen keeps its own strings since it never produces a `'resigned'` status.
 */
import type { Side } from '@jade-court/xiangqi-engine';
import { seatLabel } from '../lib/displayName';

/** Online room status: extends the engine `GameStatus` with `'resigned'`. */
export type OnlineRoomStatus = 'checkmate' | 'stalemate' | 'resigned' | null;

/** Did this side win the room? Reads the server winner when available and
 * falls back to the old "side to move lost" inference for older snapshots. */
export function didSideWin(
  status: OnlineRoomStatus,
  serverWinner: Side | null,
  side: Side,
  turn: Side,
  opp: (s: Side) => Side,
): boolean {
  if (!status) return false;
  if (serverWinner) return serverWinner === side;
  return turn === opp(side);
}

export type GameOverNameContext = {
  redName?: string | null;
  blackName?: string | null;
};

function loserSide(winner: Side | null): Side | null {
  if (!winner) return null;
  return winner === 'r' ? 'b' : 'r';
}

/**
 * Subtitle wording for the multiplayer game-over overlay.
 *
 * - `'stalemate'` → plain "Stalemate."
 * - `'checkmate'` → plain "Checkmate!"
 * - `'resigned'`:
 *   - `won=true`  → "`{loserName}` resigned." (display name when set).
 *   - `won=false` → "You resigned."
 */
export function onlineGameOverSubtitle(
  status: OnlineRoomStatus,
  won: boolean,
  winner: Side | null,
  names?: GameOverNameContext,
): string {
  if (status === 'stalemate') return 'Stalemate.';
  if (status === 'checkmate') return 'Checkmate!';
  if (status === 'resigned') {
    if (!won) return 'You resigned.';
    const loser = loserSide(winner);
    if (loser) {
      const label = seatLabel(loser, names?.redName, names?.blackName);
      return `${label} resigned.`;
    }
    return 'Your opponent resigned.';
  }
  return '';
}
