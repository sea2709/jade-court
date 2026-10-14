/**
 * Unit tests for `apps/web/src/screens/multiplayerGameOver.ts`.
 *
 * Pure helper so this can be tested without a React renderer. Covers the
 * three status branches and both win/lose perspectives for `'resigned'`.
 */
import { describe, expect, it } from 'vitest';
import { didSideWin, onlineGameOverSubtitle } from './multiplayerGameOver';

describe('onlineGameOverSubtitle', () => {
  it('shows a plain Stalemate. for stalemate regardless of winner', () => {
    expect(onlineGameOverSubtitle('stalemate', true, 'r')).toBe('Stalemate.');
    expect(onlineGameOverSubtitle('stalemate', false, 'r')).toBe('Stalemate.');
    expect(onlineGameOverSubtitle('stalemate', false, null)).toBe('Stalemate.');
  });

  it('shows a plain Checkmate! for checkmate regardless of winner', () => {
    expect(onlineGameOverSubtitle('checkmate', true, 'b')).toBe('Checkmate!');
    expect(onlineGameOverSubtitle('checkmate', false, 'b')).toBe('Checkmate!');
    expect(onlineGameOverSubtitle('checkmate', false, null)).toBe('Checkmate!');
  });

  it('says "Red resigned — Black wins." when Red resigns and Black wins', () => {
    expect(onlineGameOverSubtitle('resigned', true, 'b')).toBe('Red resigned — Black wins.');
  });

  it('says "Black resigned — Red wins." when Black resigns and Red wins', () => {
    expect(onlineGameOverSubtitle('resigned', true, 'r')).toBe('Black resigned — Red wins.');
  });

  it('says "You resigned." to the resigning (losing) player', () => {
    expect(onlineGameOverSubtitle('resigned', false, 'b')).toBe('You resigned.');
    expect(onlineGameOverSubtitle('resigned', false, 'r')).toBe('You resigned.');
  });
});

describe('didSideWin', () => {
  const OPP = (s: 'r' | 'b') => (s === 'r' ? 'b' : 'r');

  it('is false while the game is in progress (status null)', () => {
    expect(didSideWin(null, 'r', 'r', 'b', OPP)).toBe(false);
    expect(didSideWin(null, null, 'r', 'r', OPP)).toBe(false);
  });

  it('returns serverWinner === side when the server has reported a winner', () => {
    expect(didSideWin('resigned', 'b', 'b', 'r', OPP)).toBe(true);
    expect(didSideWin('resigned', 'b', 'r', 'r', OPP)).toBe(false);
    expect(didSideWin('checkmate', 'r', 'r', 'b', OPP)).toBe(true);
    expect(didSideWin('checkmate', 'r', 'b', 'b', OPP)).toBe(false);
  });

  it('falls back to "side to move lost" when winner is null', () => {
    // Status set but no server winner — uses the original inference.
    expect(didSideWin('checkmate', null, 'b', 'r', OPP)).toBe(true); // Red to move lost
    expect(didSideWin('checkmate', null, 'r', 'r', OPP)).toBe(false);
  });
});
