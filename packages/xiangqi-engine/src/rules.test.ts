import { describe, expect, it } from 'vitest';
import * as X from './rules.js';
import type { Board, Coord, Move, Piece } from './types.js';

function emptyBoard(): Board {
  return Array.from({ length: 10 }, () => Array(9).fill(null)) as Board;
}

/** Build a sparse board from `[row, col, piece]` triples. */
function boardWith(...pieces: [number, number, Piece][]): Board {
  const b = emptyBoard();
  for (const [r, c, p] of pieces) b[r][c] = p;
  return b;
}

const targets = (moves: Move[]): Coord[] => moves.map((m) => m.to);

describe('xiangqi rules', () => {
  it('starts with 32 pieces', () => {
    const b = X.initialBoard();
    let n = 0;
    for (let r = 0; r < X.ROWS; r++) for (let c = 0; c < X.COLS; c++) if (b[r][c]) n++;
    expect(n).toBe(32);
  });

  it('red has legal opening moves', () => {
    expect(X.legalMoves(X.initialBoard(), 'r').length).toBeGreaterThan(0);
  });

  it('detects flying general', () => {
    const b = Array.from({ length: 10 }, () => Array(9).fill(null)) as ReturnType<
      typeof X.initialBoard
    >;
    b[9][4] = { t: 'G', s: 'r' };
    b[0][4] = { t: 'G', s: 'b' };
    expect(X.generalsFacing(b)).toBe(true);
    expect(X.inCheck(b, 'r')).toBe(true);
  });

  it('replaying moves from snapshots restores captures', () => {
    const b = Array.from({ length: 10 }, () => Array(9).fill(null)) as ReturnType<
      typeof X.initialBoard
    >;
    b[9][4] = { t: 'G', s: 'r' };
    b[6][4] = { t: 'C', s: 'r' };
    b[3][4] = { t: 'S', s: 'b' };
    b[2][4] = { t: 'R', s: 'b' };
    b[0][3] = { t: 'G', s: 'b' };
    const capture = X.legalMoves(b, 'r').find((m) => m.to[0] === 2 && m.to[1] === 4)!;
    const frozen = { from: [...capture.from], to: [...capture.to] };
    const boardBefore = X.cloneBoard(b);
    const after = X.applyMove(b, frozen);
    expect(after[2][4]?.t).toBe('C');
    expect(after[6][4]).toBeNull();

    const restored = X.cloneBoard(boardBefore);
    expect(restored[2][4]?.t).toBe('R');
    expect(restored[6][4]?.t).toBe('C');
  });

  it('cloning move coords preserves replay after mutation', () => {
    const b = X.initialBoard();
    const move = X.legalMoves(b, 'r')[0];
    const frozen = { from: [...move.from], to: [...move.to] };
    move.from[0] = 99;
    const replayed = X.applyMove(X.initialBoard(), frozen);
    expect(replayed[frozen.to[0]][frozen.to[1]]).not.toBeNull();
  });

  it('puzzle p1 cannon capture is legal', () => {
    const b = Array.from({ length: 10 }, () => Array(9).fill(null)) as ReturnType<
      typeof X.initialBoard
    >;
    b[9][4] = { t: 'G', s: 'r' };
    b[6][4] = { t: 'C', s: 'r' };
    b[3][4] = { t: 'S', s: 'b' };
    b[2][4] = { t: 'R', s: 'b' };
    b[0][3] = { t: 'G', s: 'b' };
    const moves = X.legalMoves(b, 'r');
    const capture = moves.find((m) => m.to[0] === 2 && m.to[1] === 4);
    expect(capture).toBeDefined();
  });
});

describe('xiangqi rules: edge cases', () => {
  it('generals do not face when a piece stands between them', () => {
    const b = boardWith(
      [9, 4, { t: 'G', s: 'r' }],
      [0, 4, { t: 'G', s: 'b' }],
      [5, 4, { t: 'S', s: 'r' }],
    );
    expect(X.generalsFacing(b)).toBe(false);
  });

  it('a general may not step onto the open file facing the enemy general', () => {
    const b = boardWith([9, 3, { t: 'G', s: 'r' }], [0, 4, { t: 'G', s: 'b' }]);
    const to = targets(X.legalMoves(b, 'r'));
    expect(to).toContainEqual([8, 3]);
    expect(to).not.toContainEqual([9, 4]);
  });

  it('a pinned screen piece cannot leave the file between the generals', () => {
    const b = boardWith(
      [9, 4, { t: 'G', s: 'r' }],
      [0, 4, { t: 'G', s: 'b' }],
      [5, 4, { t: 'R', s: 'r' }],
    );
    const rookMoves = X.movesFrom(b, 5, 4);
    expect(rookMoves.every((m) => m.to[1] === 4)).toBe(true);
  });

  it('a horse is blocked when its leg is hobbled', () => {
    const base: [number, number, Piece][] = [
      [9, 3, { t: 'G', s: 'r' }],
      [0, 5, { t: 'G', s: 'b' }],
      [5, 4, { t: 'H', s: 'r' }],
    ];
    const free = targets(X.movesFrom(boardWith(...base), 5, 4));
    expect(free).toHaveLength(8);

    const hobbled = targets(X.movesFrom(boardWith(...base, [4, 4, { t: 'S', s: 'b' }]), 5, 4));
    expect(hobbled).not.toContainEqual([3, 3]);
    expect(hobbled).not.toContainEqual([3, 5]);
    expect(hobbled).toHaveLength(6);
  });

  it('an elephant is blocked when its eye is occupied', () => {
    const b = boardWith(
      [9, 4, { t: 'G', s: 'r' }],
      [0, 3, { t: 'G', s: 'b' }],
      [9, 2, { t: 'E', s: 'r' }],
      [8, 3, { t: 'A', s: 'r' }],
    );
    const to = targets(X.movesFrom(b, 9, 2));
    expect(to).toContainEqual([7, 0]);
    expect(to).not.toContainEqual([7, 4]);
  });

  it('an elephant cannot cross the river', () => {
    const b = boardWith(
      [9, 4, { t: 'G', s: 'r' }],
      [0, 3, { t: 'G', s: 'b' }],
      [5, 2, { t: 'E', s: 'r' }],
    );
    const to = targets(X.movesFrom(b, 5, 2));
    expect(to).toEqual(expect.arrayContaining([[7, 0] as Coord, [7, 4] as Coord]));
    expect(to.some(([r]) => r < 5)).toBe(false);
  });

  it('a cannon captures only over exactly one screen', () => {
    const generals: [number, number, Piece][] = [
      [9, 3, { t: 'G', s: 'r' }],
      [0, 5, { t: 'G', s: 'b' }],
    ];
    const noScreen = boardWith(...generals, [5, 0, { t: 'C', s: 'r' }], [5, 4, { t: 'R', s: 'b' }]);
    const noScreenMoves = X.movesFrom(noScreen, 5, 0);
    expect(noScreenMoves.some((m) => m.capture)).toBe(false);
    expect(targets(noScreenMoves)).toContainEqual([5, 3]);

    const screened = boardWith(
      ...generals,
      [5, 0, { t: 'C', s: 'r' }],
      [5, 2, { t: 'S', s: 'b' }],
      [5, 4, { t: 'R', s: 'b' }],
    );
    const screenedMoves = X.movesFrom(screened, 5, 0);
    expect(screenedMoves).toContainEqual({ from: [5, 0], to: [5, 4], capture: true });
    expect(targets(screenedMoves)).not.toContainEqual([5, 2]);
    expect(targets(screenedMoves)).not.toContainEqual([5, 3]);
  });

  it('the general and advisors stay inside the palace', () => {
    const b = boardWith(
      [7, 3, { t: 'G', s: 'r' }],
      [0, 5, { t: 'G', s: 'b' }],
      [9, 5, { t: 'A', s: 'r' }],
    );
    const gen = targets(X.movesFrom(b, 7, 3));
    expect(gen).not.toContainEqual([6, 3]);
    expect(gen).not.toContainEqual([7, 2]);
    expect(gen).toEqual(expect.arrayContaining([[8, 3] as Coord, [7, 4] as Coord]));

    expect(targets(X.movesFrom(b, 9, 5))).toEqual([[8, 4]]);
  });

  it('soldiers move sideways only after crossing the river and never backward', () => {
    const generals: [number, number, Piece][] = [
      [9, 3, { t: 'G', s: 'r' }],
      [0, 5, { t: 'G', s: 'b' }],
    ];
    const before = boardWith(...generals, [6, 0, { t: 'S', s: 'r' }]);
    expect(targets(X.movesFrom(before, 6, 0))).toEqual([[5, 0]]);

    const after = boardWith(...generals, [4, 2, { t: 'S', s: 'r' }]);
    const to = targets(X.movesFrom(after, 4, 2));
    expect(to).toHaveLength(3);
    expect(to).toEqual(expect.arrayContaining([[3, 2] as Coord, [4, 1] as Coord, [4, 3] as Coord]));
  });

  it('reports checkmate when the side in check has no legal moves', () => {
    const b = boardWith(
      [9, 3, { t: 'G', s: 'r' }],
      [0, 4, { t: 'G', s: 'b' }],
      [0, 0, { t: 'R', s: 'r' }],
      [1, 8, { t: 'R', s: 'r' }],
    );
    expect(X.inCheck(b, 'b')).toBe(true);
    expect(X.gameStatus(b, 'b')).toBe('checkmate');
  });

  it('reports stalemate when the side to move has no legal moves and is not in check', () => {
    const b = boardWith(
      [9, 3, { t: 'G', s: 'r' }],
      [0, 4, { t: 'G', s: 'b' }],
      [1, 0, { t: 'R', s: 'r' }],
      [5, 3, { t: 'R', s: 'r' }],
      [5, 5, { t: 'R', s: 'r' }],
    );
    expect(X.inCheck(b, 'b')).toBe(false);
    expect(X.gameStatus(b, 'b')).toBe('stalemate');
  });

  it('returns null status while legal moves remain', () => {
    expect(X.gameStatus(X.initialBoard(), 'r')).toBeNull();
  });

  it('names squares from each side’s perspective', () => {
    expect(X.squareName('r', 9, 0)).toBe('1-1');
    expect(X.squareName('b', 0, 8)).toBe('9-1');
  });
});
