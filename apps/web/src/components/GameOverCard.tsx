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
    <div
      className="pop"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(43,38,34,.45)',
        borderRadius: 14,
        zIndex: 20,
      }}
    >
      <div className="card" style={{ padding: '30px 34px', textAlign: 'center', maxWidth: 320 }}>
        <div style={{ fontSize: 46, marginBottom: 6 }}>{won ? '🏆' : '🎯'}</div>
        <h2 style={{ margin: '0 0 6px', fontSize: 26 }}>{won ? 'You win!' : 'You lose'}</h2>
        <p style={{ color: 'var(--ink-soft)', fontWeight: 600, margin: '0 0 18px' }}>
          {status === 'stalemate'
            ? 'Stalemate — the side to move had no legal move.'
            : 'Checkmate on the board.'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
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
