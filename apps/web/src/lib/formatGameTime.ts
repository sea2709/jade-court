/**
 * Human-readable relative time for saved-game cards.
 */
export function formatLastPlayed(updatedAt: string): string {
  const then = Date.parse(updatedAt);
  if (Number.isNaN(then)) return updatedAt;
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return new Date(then).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Locale date/time for resume system lines. */
export function formatResumedAt(updatedAt: string): string {
  const then = Date.parse(updatedAt);
  if (Number.isNaN(then)) return updatedAt;
  return new Date(then).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
