/**
 * Unit tests for `apps/web/src/screens/multiplayerGameOver.ts`.
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

  it('uses display names when the opponent resigned', () => {
    expect(
      onlineGameOverSubtitle('resigned', true, 'b', { redName: 'Minh', blackName: 'Lan' }),
    ).toBe('Minh resigned.');
    expect(
      onlineGameOverSubtitle('resigned', true, 'r', { redName: 'Minh', blackName: 'Lan' }),
    ).toBe('Lan resigned.');
  });

  it('falls back to Red player / Black player when names are missing', () => {
    expect(onlineGameOverSubtitle('resigned', true, 'b', { redName: null, blackName: null })).toBe(
      'Red player resigned.',
    );
    expect(onlineGameOverSubtitle('resigned', true, 'r', { redName: null, blackName: null })).toBe(
      'Black player resigned.',
    );
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
    expect(didSideWin('checkmate', null, 'b', 'r', OPP)).toBe(true);
    expect(didSideWin('checkmate', null, 'r', 'r', OPP)).toBe(false);
  });
});
