/**
 * Meta data-deletion callback: verify signed_request, anonymize user, return status URL.
 */
import type { EmailTokenStore } from '../../emailTokens/store.js';
import type { SessionStore } from '../../users/sessionStore.js';
import type { UserStore } from '../../users/store.js';
import { appBaseUrl, facebookAppSecret, isFacebookOAuthConfigured } from './config.js';
import { facebookDataDeletionConfirmationCode } from './dataDeletionConfirmationCode.js';
import type { DataDeletionStore } from './dataDeletionStore.js';
import { parseFacebookSignedRequest } from './signedRequest.js';

export type FacebookDataDeletionDeps = {
  userStore: UserStore;
  sessionStore: SessionStore;
  dataDeletionStore: DataDeletionStore;
  emailTokenStore?: EmailTokenStore;
};

export type FacebookDataDeletionResult =
  | { ok: true; url: string; confirmation_code: string }
  | { ok: false; error: 'not_configured' | 'invalid_signed_request' | 'invalid_body' };

async function revokeEmailTokens(
  emailTokenStore: EmailTokenStore | undefined,
  userId: string,
): Promise<void> {
  if (!emailTokenStore) return;
  await emailTokenStore.deleteByUserIdAndKind(userId, 'verify');
  await emailTokenStore.deleteByUserIdAndKind(userId, 'reset');
}

export async function handleFacebookDataDeletion(
  signedRequest: string | undefined,
  deps: FacebookDataDeletionDeps,
): Promise<FacebookDataDeletionResult> {
  if (!isFacebookOAuthConfigured()) {
    return { ok: false, error: 'not_configured' };
  }
  if (!signedRequest || typeof signedRequest !== 'string' || !signedRequest.trim()) {
    return { ok: false, error: 'invalid_body' };
  }

  const secret = facebookAppSecret();
  const payload = parseFacebookSignedRequest(signedRequest, secret);
  if (!payload) {
    return { ok: false, error: 'invalid_signed_request' };
  }

  const confirmation_code = facebookDataDeletionConfirmationCode(payload.user_id, secret);
  const deletedAt = new Date();

  const user = await deps.userStore.findByIdentity('facebook', payload.user_id);
  if (user) {
    await deps.userStore.anonymizeUser(user.id);
    await deps.sessionStore.deleteAllForUser(user.id);
    await revokeEmailTokens(deps.emailTokenStore, user.id);
  }

  await deps.dataDeletionStore.record({
    confirmationCode: confirmation_code,
    facebookUserId: payload.user_id,
    deletedAt,
  });

  const url = new URL('/account/data-deletion', appBaseUrl());
  url.searchParams.set('code', confirmation_code);
  return { ok: true, url: url.toString(), confirmation_code };
}
