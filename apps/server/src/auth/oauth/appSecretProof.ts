/**
 * Meta Graph API `appsecret_proof` (HMAC-SHA256 of access token, keyed by app secret).
 */
import { createHmac } from 'node:crypto';

/** Hex digest used as `appsecret_proof` query parameter on Graph API calls. */
export function facebookAppSecretProof(accessToken: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(accessToken).digest('hex');
}
