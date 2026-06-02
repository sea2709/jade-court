import { X } from '@jade-court/xiangqi-engine';
import type { PieceType, Side } from '@jade-court/xiangqi-engine';

export function CapturedTray({ side, list }: { side: Side; list: PieceType[] }) {
  const oppSide = X.opp(side);
  return (
    <div className="flex flex-wrap gap-1 min-h-[26px] items-center">
      {list.length === 0 && (
        <span className="text-muted text-[13px] font-bold">—</span>
      )}
      {list.map((t, i) => (
        <span
          key={i}
          className={`font-piece font-bold text-[17px] w-[26px] h-[26px] grid place-items-center rounded-[7px] ${
            oppSide === 'r'
              ? 'bg-red-soft text-red-deep'
              : 'bg-black-soft text-black-deep'
          }`}
        >
          {X.CHAR[oppSide][t]}
        </span>
      ))}
    </div>
  );
}
