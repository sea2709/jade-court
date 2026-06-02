import type { Difficulty } from '../types.js';

export interface UciSearchParams {
  /** UCI `go` arguments, e.g. `depth 8` or `movetime 2000`. */
  go: string;
}

/** Map Play difficulty to Pikafish search strength. */
export function uciSearchParams(difficulty: Difficulty): UciSearchParams {
  switch (difficulty) {
    case 'beginner':
      return { go: 'depth 2' };
    case 'intermediate':
      return { go: 'depth 8' };
    case 'advanced':
      return { go: 'depth 14' };
    default:
      return { go: 'depth 8' };
  }
}
