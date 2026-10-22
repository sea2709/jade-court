/**
 * Day-pass helpers: check active access and extend `accessUntil` on user records.
 */
import { MAX_PLAY_AI_ACCESS_HOURS } from './config.js';
import type { UserStore } from '../users/store.js';
import type { UserRecord } from '../users/types.js';

type AccessHolder = { accessUntil?: Date | null } | null;

const MS_PER_HOUR = 60 * 60 * 1000;

/** Converts grant hours to milliseconds, or `null` when out of range or unsafe. */
export function grantHoursToMs(hours: number): number | null {
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_PLAY_AI_ACCESS_HOURS) {
    return null;
  }
  const ms = hours * MS_PER_HOUR;
  if (!Number.isSafeInteger(ms)) {
    return null;
  }
  return ms;
}

/** True when the user has `accessUntil` strictly after `now` (hard cutoff at expiry). */
export function hasPlayAccess(user: AccessHolder, now: Date): boolean {
  if (!user?.accessUntil) return false;
  return user.accessUntil.getTime() > now.getTime();
}

/**
 * Extend play-AI access by `hours`, stacking on remaining time or starting fresh after expiry.
 * Returns the updated user, or `null` when the id is unknown, malformed, or `hours` is invalid.
 */
export async function extendAccess(
  store: UserStore,
  userId: string,
  hours: number,
  now: Date,
): Promise<UserRecord | null> {
  const ms = grantHoursToMs(hours);
  if (ms === null) return null;
  return store.extendAccess(userId, ms, now);
}
