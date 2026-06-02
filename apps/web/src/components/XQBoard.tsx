import { X } from '@jade-court/xiangqi-engine';
import type { Board, Coord, Move } from '@jade-court/xiangqi-engine';
import type { ReactNode } from 'react';

interface Props {
  board: Board;
  cell?: number;
  selected?: Coord | null;
  targets?: Move[];
  onPoint?: (r: number, c: number) => void;
  lastMove?: { from: Coord; to: Coord } | null;
  checkPos?: Coord | null;
  hint?: { from: Coord; to: Coord } | null;
  /** Stronger last-move styling when the opponent (e.g. AI) played the ply. */
  opponentLastMove?: boolean;
  /** Pulse the opponent last-move highlight during the post-move reveal. */
  opponentMoveRevealing?: boolean;
  flip?: boolean;
  interactive?: boolean;
}

export function XQBoard({
  board,
  cell = 56,
  selected = null,
  targets = [],
  onPoint = () => {},
  lastMove = null,
  checkPos = null,
  hint = null,
  opponentLastMove = false,
  opponentMoveRevealing = false,
  flip = false,
  interactive = true,
}: Props) {
  const margin = Math.round(cell * 0.62);
  const W = 8 * cell + 2 * margin;
  const H = 9 * cell + 2 * margin;
  const disc = Math.round(cell * 0.84);

  const px = (r: number, c: number) => {
    const rr = flip ? 9 - r : r;
    const cc = flip ? 8 - c : c;
    return { x: margin + cc * cell, y: margin + rr * cell };
  };

  const lines: ReactNode[] = [];
  const X0 = margin;
  const X1 = margin + 8 * cell;
  for (let r = 0; r < 10; r++) {
    const y = margin + r * cell;
    lines.push(<line key={`h${r}`} x1={X0} y1={y} x2={X1} y2={y} />);
  }
  for (let c = 0; c < 9; c++) {
    const x = margin + c * cell;
    if (c === 0 || c === 8) {
      lines.push(<line key={`v${c}`} x1={x} y1={margin} x2={x} y2={margin + 9 * cell} />);
    } else {
      lines.push(<line key={`vt${c}`} x1={x} y1={margin} x2={x} y2={margin + 4 * cell} />);
      lines.push(<line key={`vb${c}`} x1={x} y1={margin + 5 * cell} x2={x} y2={margin + 9 * cell} />);
    }
  }

  const palace = [
    [3, 0, 5, 2],
    [5, 0, 3, 2],
    [3, 7, 5, 9],
    [5, 7, 3, 9],
  ].map(([c1, r1, c2, r2], i) => (
    <line
      key={`p${i}`}
      x1={margin + c1 * cell}
      y1={margin + r1 * cell}
      x2={margin + c2 * cell}
      y2={margin + r2 * cell}
    />
  ));

  const markPts: [number, number][] = [
    [2, 1],
    [2, 7],
    [7, 1],
    [7, 7],
    [3, 0],
    [3, 2],
    [3, 4],
    [3, 6],
    [3, 8],
    [6, 0],
    [6, 2],
    [6, 4],
    [6, 6],
    [6, 8],
  ];
  const ticks: ReactNode[] = [];
  markPts.forEach(([r, c], idx) => {
    const cx = margin + c * cell;
    const cy = margin + r * cell;
    const t = Math.max(3, cell * 0.085);
    const g = Math.max(2.5, cell * 0.06);
    const corners: [number, number][] = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];
    corners.forEach(([sx, sy], k) => {
      if (c === 0 && sx < 0) return;
      if (c === 8 && sx > 0) return;
      ticks.push(
        <path
          key={`tk${idx}-${k}`}
          fill="none"
          d={`M ${cx + sx * g} ${cy + sy * g + sy * t} L ${cx + sx * g} ${cy + sy * g} L ${cx + sx * g + sx * t} ${cy + sy * g}`}
        />,
      );
    });
  });

  const captureTargets = new Set(
    selected ? targets.filter((t) => t.capture).map((t) => `${t.to[0]},${t.to[1]}`) : [],
  );

  const pieces: ReactNode[] = [];
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (!p) continue;
      const { x, y } = px(r, c);
      const sel = selected?.[0] === r && selected[1] === c;
      const last =
        lastMove &&
        ((lastMove.from[0] === r && lastMove.from[1] === c) ||
          (lastMove.to[0] === r && lastMove.to[1] === c));
      const chk = checkPos?.[0] === r && checkPos[1] === c;
      const cap = captureTargets.has(`${r},${c}`);
      const cls = ['piece', p.s === 'r' ? 'red' : 'black'];
      if (sel) cls.push('selected');
      else if (chk) cls.push('incheck');
      else if (last) {
        cls.push('lastmove');
        if (opponentLastMove) cls.push('opponent-lastmove');
        if (opponentMoveRevealing) cls.push('opponent-lastmove-pulse');
      } else if (cap) cls.push('capture-target');
      if (interactive) cls.push('clickable');
      const pointCls = cap ? 'point capture-point' : 'point';
      pieces.push(
        <div key={`pc${r}-${c}`} className={pointCls} style={{ left: x, top: y }}>
          <div
            className={cls.join(' ')}
            style={{ width: disc, height: disc, fontSize: disc * 0.56, position: 'relative' }}
            onClick={
              interactive
                ? (e) => {
                    e.stopPropagation();
                    onPoint(r, c);
                  }
                : undefined
            }
          >
            {X.CHAR[p.s][p.t]}
          </div>
        </div>,
      );
    }

  const markers: ReactNode[] = [];
  targets.forEach((t, i) => {
    const [r, c] = t.to;
    const { x, y } = px(r, c);
    if (t.capture && !board[r][c]) {
      markers.push(
        <div key={`cap${i}`} className="marker capture" style={{ left: x, top: y }}>
          <div className="ring" style={{ width: disc + 8, height: disc + 8 }} />
        </div>,
      );
    } else if (!t.capture) {
      markers.push(
        <div key={`mk${i}`} className="marker" style={{ left: x, top: y }}>
          <div className="dot" style={{ width: cell * 0.34, height: cell * 0.34 }} />
        </div>,
      );
    }
    if (!board[r][c]) {
      markers.push(
        <div
          key={`hit${i}`}
          className="hit"
          style={{ left: x, top: y, width: cell * 0.92, height: cell * 0.92 }}
          onClick={(e) => {
            e.stopPropagation();
            onPoint(r, c);
          }}
        />,
      );
    }
  });

  const lastDots: ReactNode[] = [];
  if (lastMove) {
    [lastMove.from, lastMove.to].forEach((pt, i) => {
      const { x, y } = px(pt[0], pt[1]);
      lastDots.push(
        <div
          key={`ld${i}`}
          className={`last-dot${opponentLastMove ? ' opponent' : ''}`}
          style={{ left: x, top: y, width: cell * 0.9, height: cell * 0.9 }}
        />,
      );
    });
  }

  const hints: ReactNode[] = [];
  if (hint) {
    const f = px(hint.from[0], hint.from[1]);
    const t = px(hint.to[0], hint.to[1]);
    hints.push(
      <div
        key="hf"
        className="hint-from"
        style={{ left: f.x, top: f.y, width: disc + 6, height: disc + 6 }}
      />,
    );
    hints.push(
      <div
        key="ht"
        className="hint-to"
        style={{ left: t.x, top: t.y, width: disc + 6, height: disc + 6 }}
      />,
    );
  }

  return (
    <div className="board-wrap" style={{ width: W + 28 }}>
      <div className="board" style={{ width: W, height: H }} onClick={() => onPoint(-1, -1)}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
          <g
            stroke="var(--grid)"
            strokeWidth={Math.max(1, cell * 0.026)}
            strokeLinecap="round"
            opacity="0.85"
          >
            {lines}
            {palace}
          </g>
          <g
            stroke="var(--grid)"
            strokeWidth={Math.max(1.4, cell * 0.03)}
            strokeLinecap="round"
            opacity="0.6"
          >
            {ticks}
          </g>
        </svg>
        <div
          className="river-text"
          style={{
            left: margin,
            right: margin,
            top: margin + 4 * cell,
            height: cell,
            padding: `0 ${cell * 0.5}px`,
            fontSize: cell * 0.42,
          }}
        >
          <span>楚 河</span>
          <span>漢 界</span>
        </div>
        {lastDots}
        {hints}
        {markers}
        {pieces}
      </div>
    </div>
  );
}
