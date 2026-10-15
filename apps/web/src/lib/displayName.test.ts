import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BLACK_PLAYER_FALLBACK,
  DISPLAY_NAME_STORAGE_KEY,
  RED_PLAYER_FALLBACK,
  displayNameForApi,
  getStoredDisplayName,
  normalizeDisplayNameInput,
  opponentSeatLabel,
  saveDisplayNameInput,
  seatLabel,
} from './displayName';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('normalizeDisplayNameInput', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeDisplayNameInput('  Minh   Nguyen  ')).toBe('Minh Nguyen');
  });
});

describe('displayName persistence', () => {
  it('saves and reads from localStorage', () => {
    saveDisplayNameInput('Dang');
    expect(getStoredDisplayName()).toBe('Dang');
    expect(localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)).toBe('Dang');
  });

  it('caps stored length at 20 characters', () => {
    saveDisplayNameInput('abcdefghijklmnopqrstuvwxyz');
    expect(getStoredDisplayName()).toHaveLength(20);
  });

  it('omits empty names from API payload helper', () => {
    expect(displayNameForApi('   ')).toBeUndefined();
    expect(displayNameForApi('Alex')).toBe('Alex');
  });
});

describe('seat labels', () => {
  it('uses fallbacks when names are missing', () => {
    expect(seatLabel('r', null, null)).toBe(RED_PLAYER_FALLBACK);
    expect(seatLabel('b', null, null)).toBe(BLACK_PLAYER_FALLBACK);
  });

  it('returns opponent label for the other seat', () => {
    expect(opponentSeatLabel('r', 'Minh', null)).toBe(BLACK_PLAYER_FALLBACK);
    expect(opponentSeatLabel('r', 'Minh', 'Lan')).toBe('Lan');
  });
});
