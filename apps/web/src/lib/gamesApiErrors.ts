/**
 * User-facing copy for saved-game API failures.
 */
import { GamesApiError } from './gamesApi';

export const SAVE_NETWORK_ERROR_MESSAGE =
  "Couldn't save your game. Check your connection and try again.";

export const TOO_MANY_MOVES_MESSAGE =
  'This game is too long to save (400 moves max). Older moves cannot be synced.';

/** Maps API/network errors from autosave to banner text. */
export function messageForGamesSaveError(err: unknown): string {
  if (err instanceof GamesApiError) {
    switch (err.code) {
      case 'too_many_moves':
        return TOO_MANY_MOVES_MESSAGE;
      case 'invalid_moves':
        return "Couldn't save — the move list didn't match the board. Try Reload save.";
      case 'invalid_config':
      case 'invalid_chat':
      case 'invalid_json':
      case 'invalid_base_revision':
        return "Couldn't save your game. Try Reload save or start a new game.";
      default:
        if (err.status >= 500) {
          return "Couldn't save your game — server error. We'll try again on your next move.";
        }
        if (err.status === 400) {
          return "Couldn't save your game. Try Reload save.";
        }
        break;
    }
  }
  if (err instanceof TypeError) {
    return SAVE_NETWORK_ERROR_MESSAGE;
  }
  return SAVE_NETWORK_ERROR_MESSAGE;
}
