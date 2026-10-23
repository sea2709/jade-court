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

/** Whole minutes until expiry; `0` when expired; `null` when unknown. */
export function accessMinutesRemaining(accessUntil: string | null | undefined): number | null {
  if (!accessUntil) return null;
  const end = Date.parse(accessUntil);
  if (Number.isNaN(end)) return null;
  const ms = end - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 60_000);
}
