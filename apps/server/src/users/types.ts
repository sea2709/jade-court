/**
 * Player account documents and API-facing shapes.
 */

export type UserIdentity = { provider: string; sub: string };

/** Stored user record (Mongo or memory). */
export type UserRecord = {
  id: string;
  email?: string;
  emailVerified: boolean;
  passwordHash?: string;
  displayName?: string;
  identities: UserIdentity[];
  accessUntil?: Date;
  preferredModelId?: string;
  createdAt: Date;
};

/** JSON returned from register, login, and `/api/me`. */
export type PublicUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  accessUntil: string | null;
  preferredModelId: string | null;
};

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email ?? null,
    emailVerified: user.emailVerified,
    displayName: user.displayName ?? null,
    accessUntil: user.accessUntil ? user.accessUntil.toISOString() : null,
    preferredModelId: user.preferredModelId ?? null,
  };
}

/** Admin user list row (`GET /api/admin/users`). */
export type AdminUserSummary = {
  id: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  accessUntil: string | null;
  createdAt: string;
};

export function toAdminUserSummary(user: UserRecord): AdminUserSummary {
  return {
    id: user.id,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    emailVerified: user.emailVerified,
    accessUntil: user.accessUntil ? user.accessUntil.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function accessInfo(user: UserRecord | null): {
  active: boolean;
  accessUntil: string | null;
} {
  if (!user?.accessUntil) {
    return { active: false, accessUntil: null };
  }
  const until = user.accessUntil;
  const active = until.getTime() > Date.now();
  return { active, accessUntil: until.toISOString() };
}
