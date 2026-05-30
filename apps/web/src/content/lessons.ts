import type { Board, PieceType, Side } from '@jade-court/xiangqi-engine';

export function buildBoard(list: LessonPiece[]): Board {
  const b: Board = Array.from({ length: 10 }, () => Array(9).fill(null));
  list.forEach((p) => {
    b[p.r][p.c] = { t: p.t, s: p.s };
  });
  return b;
}

export interface LessonPiece {
  t: PieceType;
  s: Side;
  r: number;
  c: number;
}

export interface Lesson {
  key: string;
  title: string;
  zh: string;
  glyph: string;
  rule: string;
  tip: string;
  focus: [number, number] | null;
  pieces: LessonPiece[];
}

export const LESSONS: Lesson[] = [
  {
    key: 'chariot',
    title: 'The Chariot',
    zh: '車 / 俥',
    glyph: '車',
    rule: 'The Chariot is your most powerful piece. It moves any number of points in a straight line — along ranks or files — and captures the first enemy it reaches.',
    tip: 'Open files are gold. Get your Chariots active early.',
    focus: [5, 4],
    pieces: [{ t: 'R', s: 'r', r: 5, c: 4 }],
  },
  {
    key: 'cannon',
    title: 'The Cannon',
    zh: '炮 / 砲',
    glyph: '炮',
    rule: 'The Cannon moves like the Chariot, but to CAPTURE it must leap exactly one piece — the "screen" — and land on an enemy beyond it.',
    tip: 'Gold ring = a capture that jumps a screen. No screen, no capture.',
    focus: [5, 4],
    pieces: [
      { t: 'C', s: 'r', r: 5, c: 4 },
      { t: 'S', s: 'b', r: 3, c: 4 },
      { t: 'H', s: 'b', r: 1, c: 4 },
    ],
  },
  {
    key: 'horse',
    title: 'The Horse',
    zh: '馬 / 傌',
    glyph: '馬',
    rule: 'The Horse moves in an L: one point straight, then one diagonally out. But a piece directly beside it "hobbles the leg" and blocks that direction.',
    tip: "See the blocker above? The Horse can't jump over it — those moves vanish.",
    focus: [5, 4],
    pieces: [
      { t: 'H', s: 'r', r: 5, c: 4 },
      { t: 'S', s: 'b', r: 4, c: 4 },
    ],
  },
  {
    key: 'elephant',
    title: 'The Elephant',
    zh: '象 / 相',
    glyph: '相',
    rule: 'The Elephant moves exactly two points diagonally and defends its own half — it can never cross the river. A piece at the midpoint (the "eye") blocks it.',
    tip: 'Notice it stays on its side of the river — a pure defender.',
    focus: [7, 2],
    pieces: [{ t: 'E', s: 'r', r: 7, c: 2 }],
  },
  {
    key: 'advisor',
    title: 'The Advisor',
    zh: '士 / 仕',
    glyph: '仕',
    rule: 'Advisors guard the General. They move one point diagonally and never leave the palace — the 3×3 zone with the cross.',
    tip: 'Two Advisors form a shield in front of your General.',
    focus: [8, 4],
    pieces: [{ t: 'A', s: 'r', r: 8, c: 4 }],
  },
  {
    key: 'general',
    title: 'The General',
    zh: '將 / 帥',
    glyph: '帥',
    rule: 'The General moves one point straight (never diagonally) and stays inside the palace. Lose it and the game is over.',
    tip: 'Also: the two Generals may never face each other on an open file — the "flying General" rule.',
    focus: [8, 4],
    pieces: [{ t: 'G', s: 'r', r: 8, c: 4 }],
  },
  {
    key: 'soldier',
    title: 'The Soldier',
    zh: '卒 / 兵',
    glyph: '兵',
    rule: 'Soldiers march one point forward — never back. Once they cross the river they gain the power to step sideways too.',
    tip: 'This Soldier has already crossed, so it can go forward OR sideways.',
    focus: [4, 4],
    pieces: [{ t: 'S', s: 'r', r: 4, c: 4 }],
  },
  {
    key: 'river',
    title: 'River & Palace',
    zh: '楚河漢界',
    glyph: '河',
    rule: 'The River splits the board. Elephants and un-crossed Soldiers respect it. The Palace is the 3×3 box where each General and its Advisors are confined.',
    tip: 'Everything important happens around these two landmarks.',
    focus: null,
    pieces: [
      { t: 'G', s: 'r', r: 9, c: 4 },
      { t: 'A', s: 'r', r: 9, c: 3 },
      { t: 'A', s: 'r', r: 9, c: 5 },
      { t: 'G', s: 'b', r: 0, c: 4 },
      { t: 'A', s: 'b', r: 0, c: 3 },
      { t: 'A', s: 'b', r: 0, c: 5 },
    ],
  },
];
