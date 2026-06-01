import type { GameStatus } from '@jade-court/xiangqi-engine';

export function GameOverCard({
  status,
  won,
  onRematch,
  onMenu,
}: {
  status: GameStatus;
  won: boolean;
  onRematch: () => void;
  onMenu?: () => void;
}) {
  return (
    <div className="pop game-overlay">
      <div className="card px-[34px] py-[30px] text-center max-w-[320px]">
        <div className="text-[46px] mb-1.5">{won ? '🏆' : '🎯'}</div>
        <h2 className="m-0 mb-1.5 text-[26px]">{won ? 'You win!' : 'You lose'}</h2>
        <p className="text-ink-soft font-semibold m-0 mb-[18px]">
          {status === 'stalemate'
            ? 'Stalemate — the side to move had no legal move.'
            : 'Checkmate on the board.'}
        </p>
        <div className="flex gap-2.5 justify-center">
          <button type="button" className="btn btn-primary" onClick={onRematch}>
            Rematch
          </button>
          {onMenu && (
            <button type="button" className="btn btn-ghost" onClick={onMenu}>
              Change level
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
