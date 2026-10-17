import { describe, expect, it } from 'vitest';
import { fullInviteCode, inviteCodeSuffix } from './inviteCode';

describe('inviteCodeSuffix', () => {
  it('strips the JADE- prefix from a full code', () => {
    expect(inviteCodeSuffix('JADE-KPSQ')).toBe('KPSQ');
    expect(inviteCodeSuffix('jade-kpsq')).toBe('KPSQ');
    expect(inviteCodeSuffix('JADE–KPSQ')).toBe('KPSQ');
  });

  it('extracts the code from a pasted invite link', () => {
    expect(inviteCodeSuffix('http://localhost:5173/multiplayer?room=JADE-L7Q5')).toBe('L7Q5');
  });

  it('keeps JADE as a valid four-letter suffix when no separator follows', () => {
    expect(inviteCodeSuffix('JADE')).toBe('JADE');
    expect(inviteCodeSuffix('JA')).toBe('JA');
  });

  it('uppercases, drops non-alphanumerics, and caps at four characters', () => {
    expect(inviteCodeSuffix(' a b-c ')).toBe('ABC');
    expect(inviteCodeSuffix('ABCDE')).toBe('ABCD');
    expect(inviteCodeSuffix('')).toBe('');
  });
});

describe('fullInviteCode', () => {
  it('prefixes the suffix with JADE-', () => {
    expect(fullInviteCode('kpsq')).toBe('JADE-KPSQ');
    expect(fullInviteCode('JADE-KPSQ')).toBe('JADE-KPSQ');
  });
});
