/**
 * Human-readable day-pass time remaining from an ISO `accessUntil` timestamp.
 */

/** True when `accessUntil` is strictly after `now` (same cutoff as server day pass). */
export function isPlayAccessActive(
  accessUntil: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!accessUntil) return false;
  const end = Date.parse(accessUntil);
  if (Number.isNaN(end)) return false;
  return end > now;
}

export function formatAccessTimeLeft(accessUntil: string | null | undefined): string | null {
  if (!accessUntil) return null;
  const end = Date.parse(accessUntil);
  if (Number.isNaN(end)) return null;
  const ms = end - Date.now();
  if (ms <= 0) return 'Day pass expired';

  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes} min left on day pass`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours} hr left on day pass`;
  }
  return `${hours} hr ${minutes} min left on day pass`;
}

/** Short countdown for account UI, e.g. `17h 42m left`. */
export function formatAccessCountdownShort(
  accessUntil: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!accessUntil) return null;
  const end = Date.parse(accessUntil);
  if (Number.isNaN(end)) return null;
  const ms = end - now;
  if (ms <= 0) return null;

  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m left`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours}h left`;
  }
  return `${hours}h ${minutes}m left`;
}

/** Locale end time for the day pass (date + time). */
export function formatAccessEndDateTime(
  accessUntil: string | null | undefined,
  locale?: string,
): string | null {
  if (!accessUntil) return null;
  const end = Date.parse(accessUntil);
  if (Number.isNaN(end)) return null;
  return new Date(end).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Progress through a day-pass window (0–1); `null` when inputs are invalid. */
export function dayPassWindowProgress(
  grantStartIso: string,
  grantEndIso: string,
  now = Date.now(),
): number | null {
  const start = Date.parse(grantStartIso);
  const end = Date.parse(grantEndIso);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const t = Math.min(Math.max(now, start), end);
  return (t - start) / (end - start);
}

/** Whole minutes until expiry; `0` when expired; `null` when unknown. */
export function accessMinutesRemaining(accessUntil: string | null | undefined): number | null {
  if (!accessUntil) return null;
  const end = Date.parse(accessUntil);
  if (Number.isNaN(end)) return null;
  const ms = end - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 60_000);
}
