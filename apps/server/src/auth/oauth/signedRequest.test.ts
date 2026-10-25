import { describe, expect, it } from 'vitest';
import { buildFacebookSignedRequestForTests, parseFacebookSignedRequest } from './signedRequest.js';

describe('parseFacebookSignedRequest', () => {
  const secret = 'test-facebook-app-secret';

  it('accepts a valid signed_request', () => {
    const signed = buildFacebookSignedRequestForTests({ user_id: '12345' }, secret);
    const payload = parseFacebookSignedRequest(signed, secret);
    expect(payload).toMatchObject({ user_id: '12345', algorithm: 'HMAC-SHA256' });
  });

  it('rejects tampered payload segment', () => {
    const signed = buildFacebookSignedRequestForTests({ user_id: '12345' }, secret);
    const [sig, payload] = signed.split('.');
    const tampered = `${sig}.${payload.slice(0, -1)}x`;
    expect(parseFacebookSignedRequest(tampered, secret)).toBeNull();
  });

  it('rejects wrong app secret', () => {
    const signed = buildFacebookSignedRequestForTests({ user_id: '12345' }, secret);
    expect(parseFacebookSignedRequest(signed, 'other-secret')).toBeNull();
  });
});
