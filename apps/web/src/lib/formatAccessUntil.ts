/**
 * Human-readable day-pass time remaining from an ISO `accessUntil` timestamp.
 */
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
