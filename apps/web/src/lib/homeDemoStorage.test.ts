import { describe, expect, it } from 'vitest';
import {
  HOME_DEMO_MAX_SAVED_PLIES,
  HOME_DEMO_STORAGE_KEY,
  parseHomeDemoSave,
  serializeHomeDemoSave,
} from './homeDemoStorage';

describe('homeDemoStorage', () => {
  it('round-trips v1 move lists', () => {
    const moves = [{ from: [7, 1], to: [7, 4] }] as {
      from: [number, number];
      to: [number, number];
    }[];
    const raw = serializeHomeDemoSave(moves);
    expect(parseHomeDemoSave(raw)).toEqual({ ok: true, moves });
  });

  it('rejects malformed JSON and wrong version', () => {
    expect(parseHomeDemoSave('{')).toEqual({ ok: false });
    expect(parseHomeDemoSave(JSON.stringify({ v: 2, moves: [] }))).toEqual({ ok: false });
    expect(
      parseHomeDemoSave(JSON.stringify({ v: 1, moves: [{ from: [1.5, 0], to: [2, 2] }] })),
    ).toEqual({
      ok: false,
    });
  });

  it('exports the homepage demo storage key', () => {
    expect(HOME_DEMO_STORAGE_KEY).toBe('jade-court-home-demo');
  });

  it('rejects saves with more plies than HOME_DEMO_MAX_SAVED_PLIES', () => {
    const moves = Array.from({ length: HOME_DEMO_MAX_SAVED_PLIES + 1 }, () => ({
      from: [7, 1],
      to: [7, 4],
    }));
    const raw = JSON.stringify({ v: 1, moves });
    expect(parseHomeDemoSave(raw)).toEqual({ ok: false });
  });
});
