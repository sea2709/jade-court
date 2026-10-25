import { describe, expect, it } from 'vitest';
import {
  isValidDataDeletionConfirmationCode,
  normalizeDataDeletionConfirmationCode,
} from './dataDeletionCode';

describe('dataDeletionCode', () => {
  const valid = 'a1b2c3d4e5f6789012345678abcdef01';

  it('accepts 32-character hex confirmation codes', () => {
    expect(isValidDataDeletionConfirmationCode(valid)).toBe(true);
    expect(isValidDataDeletionConfirmationCode(valid.toUpperCase())).toBe(true);
  });

  it('rejects missing, short, or non-hex codes', () => {
    expect(isValidDataDeletionConfirmationCode('')).toBe(false);
    expect(isValidDataDeletionConfirmationCode('   ')).toBe(false);
    expect(isValidDataDeletionConfirmationCode('not-hex-code')).toBe(false);
    expect(isValidDataDeletionConfirmationCode(valid.slice(0, 31))).toBe(false);
    expect(isValidDataDeletionConfirmationCode(`${valid}extra`)).toBe(false);
  });

  it('normalizes to lowercase trimmed hex', () => {
    expect(normalizeDataDeletionConfirmationCode(`  ${valid.toUpperCase()}  `)).toBe(valid);
  });
});
