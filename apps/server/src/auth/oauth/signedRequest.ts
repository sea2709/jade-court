/**
 * Parse and verify Facebook `signed_request` (data deletion callback).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function base64UrlToBuffer(segment: string): Buffer {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64');
}

export type FacebookSignedRequestPayload = {
  user_id: string;
  algorithm: string;
  issued_at?: number;
};

/**
 * Verify HMAC-SHA256 signature and return payload, or `null` if invalid/tampered.
 */
export function parseFacebookSignedRequest(
  signedRequest: string,
  appSecret: string,
): FacebookSignedRequestPayload | null {
  const trimmed = signedRequest.trim();
  const dot = trimmed.indexOf('.');
  if (dot <= 0) return null;
  const encodedSig = trimmed.slice(0, dot);
  const payloadSegment = trimmed.slice(dot + 1);
  if (!encodedSig || !payloadSegment) return null;

  const expectedSig = createHmac('sha256', appSecret).update(payloadSegment).digest();
  let sig: Buffer;
  try {
    sig = base64UrlToBuffer(encodedSig);
  } catch {
    return null;
  }
  if (sig.length !== expectedSig.length || !timingSafeEqual(sig, expectedSig)) {
    return null;
  }

  let data: { user_id?: unknown; algorithm?: unknown; issued_at?: unknown };
  try {
    data = JSON.parse(base64UrlToBuffer(payloadSegment).toString('utf8')) as {
      user_id?: unknown;
      algorithm?: unknown;
      issued_at?: unknown;
    };
  } catch {
    return null;
  }

  const algorithm = typeof data.algorithm === 'string' ? data.algorithm : '';
  if (algorithm.toUpperCase() !== 'HMAC-SHA256') return null;
  if (data.user_id === undefined || data.user_id === null) return null;

  return {
    user_id: String(data.user_id),
    algorithm,
    ...(typeof data.issued_at === 'number' ? { issued_at: data.issued_at } : {}),
  };
}

/** Build a signed_request for tests (same format Meta sends). */
export function buildFacebookSignedRequestForTests(
  payload: { user_id: string; algorithm?: string; issued_at?: number },
  appSecret: string,
): string {
  const body = JSON.stringify({
    algorithm: payload.algorithm ?? 'HMAC-SHA256',
    issued_at: payload.issued_at ?? Math.floor(Date.now() / 1000),
    user_id: payload.user_id,
  });
  const payloadSegment = Buffer.from(body, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const sig = createHmac('sha256', appSecret).update(payloadSegment).digest();
  const encodedSig = sig
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${encodedSig}.${payloadSegment}`;
}
