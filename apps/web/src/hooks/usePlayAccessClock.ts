/**
 * Re-evaluates day-pass expiry on an interval and at the exact `accessUntil` time.
 */
import { useEffect, useState } from 'react';
import { isPlayAccessActive } from '../lib/formatAccessUntil';

const TICK_MS = 30_000;

export function usePlayAccessClock(accessUntil: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!accessUntil) return;
    const end = Date.parse(accessUntil);
    if (Number.isNaN(end)) return;
    const ms = end - Date.now();
    if (ms <= 0) return;
    const id = window.setTimeout(() => setNow(Date.now()), ms + 50);
    return () => window.clearTimeout(id);
  }, [accessUntil]);

  const active = isPlayAccessActive(accessUntil, now);
  return { active, now };
}
