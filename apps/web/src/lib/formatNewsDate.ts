/**
 * Relative and absolute labels for news item dates (`publishedAt` ?? `sortAt`).
 */

export interface FormatNewsDateOptions {
  /** Injectable clock for tests. */
  now?: Date;
}

function parseIso(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date(NaN);
  return d;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoHasTimeComponent(iso: string): boolean {
  return /T\d{2}:\d{2}/.test(iso);
}

const weekdayMonthDayYear = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const monthDay = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const timeOnly = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Absolute tooltip, e.g. "Wednesday, October 14, 2026, 9:40 AM" when ISO includes a time.
 */
export function formatNewsDateAbsolute(iso: string): string {
  const d = parseIso(iso);
  if (Number.isNaN(d.getTime())) return iso;
  let text = weekdayMonthDayYear.format(d);
  if (isoHasTimeComponent(iso)) {
    text += `, ${timeOnly.format(d)}`;
  }
  return text;
}

/**
 * Relative label for display in cards and lists.
 */
export function formatNewsDateRelative(
  publishedAt: string | undefined,
  sortAt: string,
  options: FormatNewsDateOptions = {},
): string {
  const iso = publishedAt ?? sortAt;
  const d = parseIso(iso);
  const now = options.now ?? new Date();
  if (Number.isNaN(d.getTime())) return iso;

  const ms = now.getTime() - d.getTime();
  if (ms < 0) {
    return formatNewsDateFallback(d, now);
  }

  if (isSameCalendarDay(d, now)) {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return 'Just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
    const hours = Math.floor(min / 60);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const dayNow = startOfDay(now);
  const dayThen = startOfDay(d);
  const dayDiff = Math.round((dayNow.getTime() - dayThen.getTime()) / 86_400_000);

  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff < 7) {
    return `${dayDiff} days ago`;
  }

  return formatNewsDateFallback(d, now);
}

function formatNewsDateFallback(d: Date, now: Date): string {
  const text = monthDay.format(d);
  if (d.getFullYear() !== now.getFullYear()) {
    return `${text}, ${d.getFullYear()}`;
  }
  return text;
}

/** ISO string used for `<time dateTime>` — prefers `publishedAt`. */
export function newsDateIso(publishedAt: string | undefined, sortAt: string): string {
  return publishedAt ?? sortAt;
}
