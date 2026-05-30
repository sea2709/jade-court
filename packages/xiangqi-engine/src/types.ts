export type Side = 'r' | 'b';
export type PieceType = 'G' | 'A' | 'E' | 'H' | 'R' | 'C' | 'S';
export type GameStatus = 'checkmate' | 'stalemate' | null;
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type Verdict = 'great' | 'good' | 'ok' | 'inaccuracy' | 'mistake' | 'blunder';

export interface Piece {
  t: PieceType;
  s: Side;
}

export type Board = (Piece | null)[][];
export type Coord = [number, number];

export interface Move {
  from: Coord;
  to: Coord;
  capture?: boolean;
}
