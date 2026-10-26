import { describe, expect, it } from 'vitest';
import { facebookDataDeletionConfirmationCode } from './dataDeletionConfirmationCode.js';

describe('facebookDataDeletionConfirmationCode', () => {
  it('returns 32 lowercase hex chars deterministically', () => {
    const code = facebookDataDeletionConfirmationCode('meta-user-1', 'secret');
    expect(code).toMatch(/^[a-f0-9]{32}$/);
    expect(code).toBe(facebookDataDeletionConfirmationCode('meta-user-1', 'secret'));
    expect(code).not.toBe(facebookDataDeletionConfirmationCode('meta-user-2', 'secret'));
  });
});
