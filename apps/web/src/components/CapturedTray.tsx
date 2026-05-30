import { X } from '@jade-court/xiangqi-engine';
import type { PieceType, Side } from '@jade-court/xiangqi-engine';

export function CapturedTray({ side, list }: { side: Side; list: PieceType[] }) {
  const oppSide = X.opp(side);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 26, alignItems: 'center' }}>
      {list.length === 0 && (
        <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 700 }}>—</span>
      )}
      {list.map((t, i) => (
        <span
          key={i}
          style={{
            fontFamily: 'var(--font-piece)',
            fontWeight: 700,
            fontSize: 17,
            width: 26,
            height: 26,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 7,
            background: oppSide === 'r' ? 'var(--red-soft)' : 'var(--black-soft)',
            color: oppSide === 'r' ? 'var(--red-deep)' : 'var(--black-deep)',
          }}
        >
          {X.CHAR[oppSide][t]}
        </span>
      ))}
    </div>
  );
}
