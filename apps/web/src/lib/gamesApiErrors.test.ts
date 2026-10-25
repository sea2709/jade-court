import { describe, expect, it } from 'vitest';
import { GamesApiError } from './gamesApi';
import { messageForGamesSaveError, TOO_MANY_MOVES_MESSAGE } from './gamesApiErrors';

describe('messageForGamesSaveError', () => {
  it('maps too_many_moves', () => {
    expect(
      messageForGamesSaveError(new GamesApiError('too_many_moves', 400, 'too_many_moves')),
    ).toBe(TOO_MANY_MOVES_MESSAGE);
  });

  it('maps network failures', () => {
    expect(messageForGamesSaveError(new TypeError('Failed to fetch'))).toMatch(/connection/i);
  });
});
