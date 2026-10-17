/**
 * Shared invite code look: muted `JADE–` prefix plus four letter boxes. Used read-only
 * in the host's invite panel and as the editable field on the join form.
 */
import { useState } from 'react';
import { INVITE_CODE_LENGTH, inviteCodeSuffix } from '../lib/inviteCode';

type InviteCodeBoxesProps = {
  /** Up to four characters; missing slots render as empty boxes. */
  chars: string;
  /** Slot to highlight while the join field has focus. */
  activeIndex?: number | null;
  /** Hide from assistive tech when an input already exposes the value. */
  decorative?: boolean;
};

/** `JADE–` prefix and four fixed boxes. */
export function InviteCodeBoxes({
  chars,
  activeIndex = null,
  decorative = false,
}: InviteCodeBoxesProps) {
  return (
    <div className="flex justify-center items-center gap-2" aria-hidden={decorative || undefined}>
      <span className="font-display font-extrabold text-muted tracking-[2px] text-lg whitespace-nowrap select-none">
        JADE–
      </span>
      <div className="flex gap-1.5">
        {Array.from({ length: INVITE_CODE_LENGTH }, (_, i) => (
          <span
            key={i}
            className={`invite-code-char${i === activeIndex ? ' invite-code-char-active' : ''}`}
            data-testid="invite-code-char"
          >
            {chars[i] ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export type InviteCodeInputProps = {
  /** Four-character suffix (no `JADE-` prefix). */
  value: string;
  onChange: (suffix: string) => void;
  disabled?: boolean;
};

/**
 * Join-form field: a transparent text input laid over the boxes, so typing, paste,
 * and mobile keyboards behave like a normal input. Pasting `JADE-XXXX` or an invite
 * link keeps just the four characters.
 */
export function InviteCodeInput({ value, onChange, disabled }: InviteCodeInputProps) {
  const [focused, setFocused] = useState(false);
  const activeIndex = focused ? Math.min(value.length, INVITE_CODE_LENGTH - 1) : null;

  return (
    <div className="relative mb-[18px]">
      <InviteCodeBoxes chars={value} activeIndex={activeIndex} decorative />
      <input
        value={value}
        onChange={(e) => onChange(inviteCodeSuffix(e.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="invite-code-input"
        aria-label="Invite code"
        inputMode="text"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="characters"
        disabled={disabled}
      />
    </div>
  );
}
