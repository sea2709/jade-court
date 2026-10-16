/**
 * User-facing copy for known `POST /api/rooms/:code/join` error strings.
 * Other server messages pass through unchanged.
 */
export function joinRoomErrorMessage(serverError: string): string {
  switch (serverError) {
    case 'Room not found':
      return 'Room not found — check the code with your friend.';
    case 'Room is full':
      return 'This room is full — both seats are already taken.';
    default:
      return serverError;
  }
}
