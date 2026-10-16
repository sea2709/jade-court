import { describe, expect, it } from 'vitest';
import { joinRoomErrorMessage } from './joinRoomError';

describe('joinRoomErrorMessage', () => {
  it('maps Room not found to friendly copy', () => {
    expect(joinRoomErrorMessage('Room not found')).toBe(
      'Room not found — check the code with your friend.',
    );
  });

  it('maps Room is full to friendly copy', () => {
    expect(joinRoomErrorMessage('Room is full')).toBe(
      'This room is full — both seats are already taken.',
    );
  });

  it('returns other server messages unchanged', () => {
    expect(joinRoomErrorMessage('Invalid room code')).toBe('Invalid room code');
  });
});
