/**
 * Map OAuth profile to user record (sign-in, email link, or new account).
 */
import { EmailTakenError, IdentityTakenError, type UserStore } from '../../users/store.js';
import type { UserIdentity, UserRecord } from '../../users/types.js';
import type { OAuthProfile } from './types.js';

export type OAuthLinkResult =
  | { ok: true; user: UserRecord; created: boolean; linked: boolean }
  | {
      ok: false;
      error: 'identity_taken' | 'email_taken' | 'email_exists_use_link' | 'link_user_missing';
    };

function identityKey(provider: string, sub: string): UserIdentity {
  return { provider, sub };
}

/** Count distinct sign-in methods (password + linked identities). */
export function signInMethodCount(user: UserRecord): number {
  let count = user.passwordHash ? 1 : 0;
  count += user.identities.length;
  return count;
}

/**
 * Resolve user for OAuth callback.
 * - Existing identity → sign in
 * - Verified OAuth email matches existing user with verified email → link identity
 * - Existing user with same email but unverified → `email_taken` (no auto-link)
 * - Else create OAuth user
 */
export async function resolveOAuthUser(
  userStore: UserStore,
  provider: string,
  profile: OAuthProfile,
): Promise<OAuthLinkResult> {
  const identity = identityKey(provider, profile.sub);
  const byIdentity = await userStore.findByIdentity(provider, profile.sub);
  if (byIdentity) {
    return { ok: true, user: byIdentity, created: false, linked: false };
  }

  // Facebook does not prove email ownership — never auto-link or create a duplicate by email.
  if (provider === 'facebook' && profile.email) {
    const byEmail = await userStore.findByEmail(profile.email);
    if (byEmail) {
      return { ok: false, error: 'email_exists_use_link' };
    }
  }

  if (profile.email && profile.emailVerified) {
    const byEmail = await userStore.findByEmail(profile.email);
    if (byEmail) {
      if (!byEmail.emailVerified) {
        return { ok: false, error: 'email_taken' };
      }
      try {
        const linked = await userStore.addIdentity(byEmail.id, identity);
        if (!linked) return { ok: false, error: 'link_user_missing' };
        return { ok: true, user: linked, created: false, linked: true };
      } catch (err) {
        if (err instanceof IdentityTakenError) {
          return { ok: false, error: 'identity_taken' };
        }
        throw err;
      }
    }
  }

  try {
    // Facebook Graph email is not verified — never persist it on sign-up (use add-email + verify).
    const persistEmail = provider === 'facebook' ? undefined : profile.email;
    const emailVerified = provider === 'facebook' ? false : profile.emailVerified;
    const user = await userStore.createOAuthUser({
      email: persistEmail,
      emailVerified,
      displayName: profile.name,
      identity,
    });
    return { ok: true, user, created: true, linked: false };
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return { ok: false, error: 'email_taken' };
    }
    if (err instanceof IdentityTakenError) {
      return { ok: false, error: 'identity_taken' };
    }
    throw err;
  }
}

/** Link OAuth identity to an already signed-in user (account settings flow). */
export async function linkOAuthToUser(
  userStore: UserStore,
  userId: string,
  provider: string,
  profile: OAuthProfile,
): Promise<OAuthLinkResult> {
  const existing = await userStore.findByIdentity(provider, profile.sub);
  if (existing && existing.id !== userId) {
    return { ok: false, error: 'identity_taken' };
  }
  if (existing && existing.id === userId) {
    const user = await userStore.findById(userId);
    if (!user) return { ok: false, error: 'link_user_missing' };
    return { ok: true, user, created: false, linked: false };
  }

  const identity = identityKey(provider, profile.sub);
  try {
    const linked = await userStore.addIdentity(userId, identity);
    if (!linked) return { ok: false, error: 'link_user_missing' };
    return { ok: true, user: linked, created: false, linked: true };
  } catch (err) {
    if (err instanceof IdentityTakenError) {
      return { ok: false, error: 'identity_taken' };
    }
    throw err;
  }
}
