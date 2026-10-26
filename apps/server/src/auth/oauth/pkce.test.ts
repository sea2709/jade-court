import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { codeChallengeS256, generateCodeVerifier } from './pkce.js';

describe('oauth PKCE', () => {
  it('generates verifier and matching S256 challenge', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    const challenge = codeChallengeS256(verifier);
    const expected = createHash('sha256').update(verifier, 'utf8').digest('base64url');
    expect(challenge).toBe(expected);
  });
});
