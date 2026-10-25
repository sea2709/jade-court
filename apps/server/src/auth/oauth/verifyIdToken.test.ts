import { describe, expect, it } from 'vitest';
import * as jose from 'jose';
import { verifyIdToken } from './verifyIdToken.js';

describe('verifyIdToken', () => {
  it('verifies signature, aud, iss, and exp with injected JWKS', async () => {
    const keys = await jose.generateKeyPair('RS256');
    const jwks = jose.createLocalJWKSet({
      keys: [
        {
          ...(await jose.exportJWK(keys.publicKey)),
          kid: 'test',
          alg: 'RS256',
          use: 'sig',
        },
      ],
    });
    const idToken = await new jose.SignJWT({
      email: 'player@example.com',
      email_verified: true,
      name: 'Player',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setSubject('google-sub-1')
      .setIssuer('https://accounts.google.com')
      .setAudience('test-client-id')
      .setExpirationTime('2h')
      .setIssuedAt()
      .sign(keys.privateKey);

    const profile = await verifyIdToken({
      idToken,
      audience: 'test-client-id',
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      jwks,
    });
    expect(profile).toEqual({
      sub: 'google-sub-1',
      email: 'player@example.com',
      emailVerified: true,
      name: 'Player',
    });
  });

  it('rejects wrong audience', async () => {
    const keys = await jose.generateKeyPair('RS256');
    const jwks = jose.createLocalJWKSet({
      keys: [
        {
          ...(await jose.exportJWK(keys.publicKey)),
          kid: 'test',
          alg: 'RS256',
          use: 'sig',
        },
      ],
    });
    const idToken = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setSubject('sub')
      .setIssuer('https://accounts.google.com')
      .setAudience('other-client')
      .setExpirationTime('2h')
      .sign(keys.privateKey);

    await expect(
      verifyIdToken({
        idToken,
        audience: 'test-client-id',
        issuer: 'https://accounts.google.com',
        jwks,
      }),
    ).rejects.toThrow();
  });
});
