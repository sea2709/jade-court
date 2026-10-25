/**
 * Read-only thumbnail board for a saved move list (continue card, account list).
 */
import { X, type Board } from '@jade-court/xiangqi-engine';
import { useMemo } from 'react';
import { XQBoard } from './XQBoard';
import type { SavedMovePly } from '../lib/gamesApi';

function boardFromMoves(moves: SavedMovePly[]): Board {
  let board = X.initialBoard();
  for (const ply of moves) {
    board = X.applyMove(board, { from: ply.from, to: ply.to });
  }
  return board;
}

export interface SavedGameMiniBoardProps {
  moves: SavedMovePly[];
  flip?: boolean;
  cell?: number;
}

/** Non-interactive mini board replaying `moves` from the start position. */
export function SavedGameMiniBoard({ moves, flip = false, cell = 28 }: SavedGameMiniBoardProps) {
  const board = useMemo(() => boardFromMoves(moves), [moves]);
  const last = moves.length > 0 ? moves[moves.length - 1] : null;
  const lastMove = last ? { from: last.from, to: last.to } : null;

  return (
    <div className="saved-mini-board shrink-0" data-testid="saved-mini-board">
      <XQBoard
        board={board}
        cell={cell}
        selected={null}
        targets={[]}
        lastMove={lastMove}
        flip={flip}
        onPoint={() => {}}
        interactive={false}
      />
    </div>
  );
}
