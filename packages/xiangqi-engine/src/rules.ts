import type { Board, Coord, GameStatus, Move, Piece, PieceType, Side } from './types.js';

export const ROWS = 10;
export const COLS = 9;

export const CHAR: Record<Side, Record<PieceType, string>> = {
  r: { G: '帥', A: '仕', E: '相', H: '傌', R: '俥', C: '炮', S: '兵' },
  b: { G: '將', A: '士', E: '象', H: '馬', R: '車', C: '砲', S: '卒' },
};

export const NAME: Record<PieceType, string> = {
  G: 'General',
  A: 'Advisor',
  E: 'Elephant',
  H: 'Horse',
  R: 'Chariot',
  C: 'Cannon',
  S: 'Soldier',
};

export const VALUE: Record<PieceType, number> = {
  R: 900,
  C: 450,
  H: 400,
  E: 200,
  A: 200,
  S: 100,
  G: 100000,
};

export function initialBoard(): Board {
  const b: Board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const back: PieceType[] = ['R', 'H', 'E', 'A', 'G', 'A', 'E', 'H', 'R'];
  for (let c = 0; c < COLS; c++) b[0][c] = { t: back[c], s: 'b' };
  b[2][1] = { t: 'C', s: 'b' };
  b[2][7] = { t: 'C', s: 'b' };
  for (let c = 0; c < COLS; c += 2) b[3][c] = { t: 'S', s: 'b' };
  for (let c = 0; c < COLS; c++) b[9][c] = { t: back[c], s: 'r' };
  b[7][1] = { t: 'C', s: 'r' };
  b[7][7] = { t: 'C', s: 'r' };
  for (let c = 0; c < COLS; c += 2) b[6][c] = { t: 'S', s: 'r' };
  return b;
}

export const cloneBoard = (b: Board): Board =>
  b.map((row) => row.map((p) => (p ? { t: p.t, s: p.s } : null)));

export const inBounds = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
export const opp = (s: Side): Side => (s === 'r' ? 'b' : 'r');

export function inPalace(s: Side, r: number, c: number): boolean {
  if (c < 3 || c > 5) return false;
  return s === 'r' ? r >= 7 && r <= 9 : r >= 0 && r <= 2;
}

function ownHalf(s: Side, r: number): boolean {
  return s === 'r' ? r >= 5 : r <= 4;
}

function soldierCrossed(s: Side, r: number): boolean {
  return s === 'r' ? r <= 4 : r >= 5;
}

export function findGeneral(b: Board, s: Side): Coord | null {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p?.t === 'G' && p.s === s) return [r, c];
    }
  return null;
}

export function pieceMoves(b: Board, r: number, c: number): Move[] {
  const p = b[r][c];
  if (!p) return [];
  const s = p.s;
  const out: Move[] = [];
  const add = (tr: number, tc: number) => {
    if (!inBounds(tr, tc)) return;
    const tp = b[tr][tc];
    if (tp?.s === s) return;
    out.push({ from: [r, c], to: [tr, tc], capture: !!tp });
  };

  switch (p.t) {
    case 'G': {
      for (const [dr, dc] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const tr = r + dr;
        const tc = c + dc;
        if (inPalace(s, tr, tc)) add(tr, tc);
      }
      break;
    }
    case 'A': {
      for (const [dr, dc] of [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]) {
        const tr = r + dr;
        const tc = c + dc;
        if (inPalace(s, tr, tc)) add(tr, tc);
      }
      break;
    }
    case 'E': {
      for (const [dr, dc] of [
        [-2, -2],
        [-2, 2],
        [2, -2],
        [2, 2],
      ]) {
        const tr = r + dr;
        const tc = c + dc;
        if (!inBounds(tr, tc) || !ownHalf(s, tr)) continue;
        const er = r + dr / 2;
        const ec = c + dc / 2;
        if (b[er][ec]) continue;
        add(tr, tc);
      }
      break;
    }
    case 'H': {
      const legs = [
        { leg: [-1, 0], jumps: [[-2, -1], [-2, 1]] as Coord[] },
        { leg: [1, 0], jumps: [[2, -1], [2, 1]] },
        { leg: [0, -1], jumps: [[-1, -2], [1, -2]] },
        { leg: [0, 1], jumps: [[-1, 2], [1, 2]] },
      ];
      for (const { leg, jumps } of legs) {
        const lr = r + leg[0];
        const lc = c + leg[1];
        if (!inBounds(lr, lc) || b[lr][lc]) continue;
        for (const [dr, dc] of jumps) add(r + dr, c + dc);
      }
      break;
    }
    case 'R': {
      for (const [dr, dc] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        let tr = r + dr;
        let tc = c + dc;
        while (inBounds(tr, tc)) {
          if (!b[tr][tc]) out.push({ from: [r, c], to: [tr, tc], capture: false });
          else {
            if (b[tr][tc]!.s !== s) out.push({ from: [r, c], to: [tr, tc], capture: true });
            break;
          }
          tr += dr;
          tc += dc;
        }
      }
      break;
    }
    case 'C': {
      for (const [dr, dc] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        let tr = r + dr;
        let tc = c + dc;
        while (inBounds(tr, tc) && !b[tr][tc]) {
          out.push({ from: [r, c], to: [tr, tc], capture: false });
          tr += dr;
          tc += dc;
        }
        if (inBounds(tr, tc)) {
          tr += dr;
          tc += dc;
          while (inBounds(tr, tc)) {
            if (b[tr][tc]) {
              if (b[tr][tc]!.s !== s) out.push({ from: [r, c], to: [tr, tc], capture: true });
              break;
            }
            tr += dr;
            tc += dc;
          }
        }
      }
      break;
    }
    case 'S': {
      const fwd = s === 'r' ? -1 : 1;
      add(r + fwd, c);
      if (soldierCrossed(s, r)) {
        add(r, c - 1);
        add(r, c + 1);
      }
      break;
    }
  }
  return out;
}

export function generatePseudoMoves(b: Board, s: Side): Move[] {
  const out: Move[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p?.s === s) out.push(...pieceMoves(b, r, c));
    }
  return out;
}

export function applyMove(b: Board, m: Move): Board {
  const nb = cloneBoard(b);
  const [fr, fc] = m.from;
  const [tr, tc] = m.to;
  nb[tr][tc] = nb[fr][fc];
  nb[fr][fc] = null;
  return nb;
}

export function generalsFacing(b: Board): boolean {
  const rg = findGeneral(b, 'r');
  const bg = findGeneral(b, 'b');
  if (!rg || !bg || rg[1] !== bg[1]) return false;
  const col = rg[1];
  const lo = Math.min(rg[0], bg[0]);
  const hi = Math.max(rg[0], bg[0]);
  for (let r = lo + 1; r < hi; r++) if (b[r][col]) return false;
  return true;
}

export function inCheck(b: Board, s: Side): boolean {
  if (generalsFacing(b)) return true;
  const gen = findGeneral(b, s);
  if (!gen) return true;
  const enemy = generatePseudoMoves(b, opp(s));
  return enemy.some((m) => m.to[0] === gen[0] && m.to[1] === gen[1]);
}

export function legalMoves(b: Board, s: Side): Move[] {
  return generatePseudoMoves(b, s).filter((m) => !inCheck(applyMove(b, m), s));
}

export function movesFrom(b: Board, r: number, c: number): Move[] {
  const p = b[r][c];
  if (!p) return [];
  return pieceMoves(b, r, c).filter((m) => !inCheck(applyMove(b, m), p.s));
}

export function hasAnyLegalMove(b: Board, s: Side): boolean {
  return legalMoves(b, s).length > 0;
}

export function gameStatus(b: Board, s: Side): GameStatus {
  if (hasAnyLegalMove(b, s)) return null;
  return inCheck(b, s) ? 'checkmate' : 'stalemate';
}

export function squareName(s: Side, r: number, c: number): string {
  const file = c + 1;
  const rank = s === 'r' ? 10 - r : r + 1;
  return `${file}-${rank}`;
}
