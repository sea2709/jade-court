/**
 * Playable two-sided demo board on the homepage (local pass-and-play, persisted).
 */
import { useEffect, useMemo, useRef } from 'react';
import { XQBoard } from './XQBoard';
import { useXiangqiGame } from '../hooks/useXiangqiGame';
import {
  HOME_DEMO_STORAGE_KEY,
  parseHomeDemoSave,
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
  serializeHomeDemoSave,
} from '../lib/homeDemoStorage';

function loadInitialMoves(): {
  moves: { from: [number, number]; to: [number, number] }[];
  parseOk: boolean;
} {
  const parsed = parseHomeDemoSave(safeGetItem(HOME_DEMO_STORAGE_KEY));
  if (!parsed.ok) return { moves: [], parseOk: false };
  return { moves: parsed.moves, parseOk: true };
}

/** Homepage hero board: both sides on one device, moves saved in localStorage. */
export function HomeDemoBoard() {
  const boot = useMemo(() => loadInitialMoves(), []);
  const initialMoves = boot.moves;
  const parseOk = boot.parseOk;

  const game = useXiangqiGame({ initialMoves });
  const redWins = game.status && game.turn === 'b';
  const turnName = game.turn === 'r' ? 'Red 帥' : 'Black 將';
  const rejectedOnMount = game.initialMovesRejected;
  const clearedBadSaveRef = useRef(false);

  const clearStorage = () => safeRemoveItem(HOME_DEMO_STORAGE_KEY);

  useEffect(() => {
    if (clearedBadSaveRef.current) return;
    if (!parseOk || rejectedOnMount) {
      clearStorage();
      clearedBadSaveRef.current = true;
    }
  }, [parseOk, rejectedOnMount]);

  useEffect(() => {
    if (game.history.length === 0) return;
    const moves = game.history.map((h) => ({
      from: h.move.from,
      to: h.move.to,
    }));
    safeSetItem(HOME_DEMO_STORAGE_KEY, serializeHomeDemoSave(moves));
  }, [game.history]);

  const restart = () => {
    clearStorage();
    game.reset();
  };

  return (
    <div className="flex flex-col items-center gap-2.5 w-full" data-testid="home-demo-board">
      <div className="relative">
        <div className="flex items-center gap-3 mb-3.5 flex-wrap justify-center">
          <span
            className={`font-extrabold text-[15px] ${
              game.turn === 'r' ? 'text-red-deep' : 'text-black-deep'
            }`}
            data-testid="home-demo-turn"
          >
            {game.status ? 'Game over' : `${turnName} to move`}
          </span>
          {game.checkSide && !game.status && <span className="pill pill-red">Check!</span>}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={game.history.length === 0}
            onClick={restart}
            data-testid="home-demo-restart"
          >
            ↻ Restart
          </button>
        </div>
        <XQBoard
          board={game.board}
          cell={42}
          selected={game.selected}
          targets={game.targets}
          lastMove={game.lastMove}
          checkPos={game.checkPos}
          flip={false}
          onPoint={game.onPoint}
          interactive={!game.status}
        />
        {game.status && (
          <div className="pop game-overlay" data-testid="home-demo-game-over">
            <div className="card px-8 py-7 text-center">
              <div className="text-[42px]">🏆</div>
              <h2 className="my-1.5 mb-1 text-[26px]">{redWins ? 'Red wins!' : 'Black wins!'}</h2>
              <p className="text-ink-soft font-semibold m-0 mb-4">
                {game.status === 'stalemate' ? 'Stalemate — no legal moves.' : 'Checkmate!'}
              </p>
              <button
                type="button"
                className="btn btn-gold"
                onClick={restart}
                data-testid="home-demo-play-again"
              >
                Play again
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="m-0 text-ink-soft text-sm font-semibold text-center max-w-[360px] leading-snug">
        Try it: tap a piece to see its moves. You play both sides.
      </p>
    </div>
  );
}
