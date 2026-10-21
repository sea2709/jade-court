import { afterEach, describe, expect, it } from 'vitest';
import {
  hashPassword,
  resetDummyPasswordHashForTests,
  verifyLoginPassword,
  verifyPassword,
} from './password.js';

describe('password hashing', () => {
  afterEach(() => {
    resetDummyPasswordHashForTests();
  });
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', 'not-valid')).toBe(false);
  });

  it('verifyLoginPassword runs scrypt for unknown users', async () => {
    const hash = await hashPassword('known-wrong');
    const knownStart = performance.now();
    await verifyLoginPassword('wrong', hash);
    const knownMs = performance.now() - knownStart;

    const unknownStart = performance.now();
    await verifyLoginPassword('wrong', undefined);
    const unknownMs = performance.now() - unknownStart;

    expect(unknownMs).toBeGreaterThan(knownMs * 0.5);
  });
});
