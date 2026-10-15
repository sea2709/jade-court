/**
 * Optional "Your name" field for multiplayer lobby / join (persisted in localStorage).
 */
import { DISPLAY_NAME_MAX_LENGTH, saveDisplayNameInput } from '../lib/displayName';

export type DisplayNameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

/** Plain-text name with n/20 counter; trims and collapses whitespace on blur. */
export function DisplayNameField({ value, onChange, disabled }: DisplayNameFieldProps) {
  const length = value.length;

  const handleBlur = () => {
    const trimmed = value.trim().replace(/\s+/g, ' ');
    const next = trimmed.slice(0, DISPLAY_NAME_MAX_LENGTH);
    onChange(next);
    saveDisplayNameInput(next);
  };

  return (
    <div className="mb-6 text-left" data-testid="display-name-field">
      <label className="block font-extrabold text-[15px] mb-2" htmlFor="display-name-input">
        Your name
      </label>
      <input
        id="display-name-input"
        type="text"
        className="room-input mb-1.5 text-left px-4 tracking-normal text-lg font-bold"
        placeholder="Optional"
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        autoComplete="nickname"
      />
      <div className="text-muted text-[13px] font-semibold text-right" aria-live="polite">
        {length}/{DISPLAY_NAME_MAX_LENGTH}
      </div>
    </div>
  );
}
