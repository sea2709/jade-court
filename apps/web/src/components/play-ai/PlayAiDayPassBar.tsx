/**
 * Day-pass countdown chip and extend banner during Play with AI.
 */
import { useEffect, useState } from 'react';
import { accessMinutesRemaining, formatAccessTimeLeft } from '../../lib/formatAccessUntil';

interface PlayAiDayPassBarProps {
  accessUntil: string | null;
  onExtend: () => void;
  extendBusy?: boolean;
}

export function PlayAiDayPassBar({ accessUntil, onExtend, extendBusy }: PlayAiDayPassBarProps) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const label = formatAccessTimeLeft(accessUntil);
  const minutes = accessMinutesRemaining(accessUntil);
  const warn = minutes != null && minutes > 0 && minutes <= 5;

  if (!label) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <span
        className={`pill text-xs ${warn ? 'pill-gold bg-amber-100 border-amber-400 text-amber-950' : 'pill-jade'}`}
        data-testid="day-pass-countdown"
      >
        {label}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm border border-line-soft"
        disabled={extendBusy}
        onClick={onExtend}
      >
        Add 24 hours · $1
      </button>
    </div>
  );
}
