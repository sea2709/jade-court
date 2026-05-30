import type { LessonPiece } from './lessons.js';

export interface Puzzle {
  key: string;
  title: string;
  kind: 'capture' | 'check' | 'mate';
  target?: [number, number];
  diff: string;
  brief: string;
  pieces: LessonPiece[];
}

export const PUZZLES: Puzzle[] = [
  {
    key: 'p1',
    title: 'Win the Chariot',
    kind: 'capture',
    target: [2, 4],
    diff: 'Easy',
    brief: 'Red to move. Your Cannon can leap a screen — snap up the Black Chariot.',
    pieces: [
      { t: 'G', s: 'r', r: 9, c: 4 },
      { t: 'C', s: 'r', r: 6, c: 4 },
      { t: 'S', s: 'b', r: 3, c: 4 },
      { t: 'R', s: 'b', r: 2, c: 4 },
      { t: 'G', s: 'b', r: 0, c: 3 },
    ],
  },
  {
    key: 'p2',
    title: 'Deliver Check',
    kind: 'check',
    diff: 'Easy',
    brief: "Red to move. Swing your Chariot onto the General's file to deliver check.",
    pieces: [
      { t: 'G', s: 'r', r: 9, c: 3 },
      { t: 'R', s: 'r', r: 3, c: 2 },
      { t: 'G', s: 'b', r: 0, c: 4 },
      { t: 'A', s: 'b', r: 0, c: 3 },
    ],
  },
  {
    key: 'p3',
    title: 'Chariot Checkmate',
    kind: 'mate',
    diff: 'Medium',
    brief: 'Red to move and mate in one. Trap the Black General in its palace.',
    pieces: [
      { t: 'G', s: 'r', r: 9, c: 4 },
      { t: 'R', s: 'r', r: 1, c: 0 },
      { t: 'R', s: 'r', r: 8, c: 1 },
      { t: 'G', s: 'b', r: 0, c: 4 },
      { t: 'A', s: 'b', r: 0, c: 5 },
      { t: 'S', s: 'r', r: 1, c: 4 },
    ],
  },
];
