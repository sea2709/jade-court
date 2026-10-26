/**
 * Lets OAuth users without an email attach one and start verification.
 */
import { useState, type FormEvent } from 'react';
import { PlayerAuthApiError, playerAddAccountEmail } from '../../lib/playerAuthApi';
import { ResendVerificationButton } from '../ResendVerificationButton';

function addEmailErrorMessage(err: unknown): string {
  if (!(err instanceof PlayerAuthApiError)) {
    return 'Could not save your email. Try again.';
  }
  switch (err.code) {
    case 'email_taken':
      return 'That email is already registered. Sign in with that account instead.';
    case 'invalid_request':
      return 'Enter a valid email address.';
    case 'rate_limited':
      return 'Too many attempts. Try again in a few minutes.';
    case 'already_has_email':
      return 'Your account already has an email on file.';
    default:
      return 'Could not save your email. Try again.';
  }
}

export type AddAccountEmailPanelProps = {
  /** Called after email is saved (verification still pending). */
  onSaved?: () => void;
  compact?: boolean;
};

/** Email capture for accounts created without an address (e.g. Facebook without email scope). */
export function AddAccountEmailPanel({ onSaved, compact }: AddAccountEmailPanelProps) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email address.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await playerAddAccountEmail(trimmed);
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(addEmailErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (saved) {
    return (
      <div
        className={
          compact
            ? 'mt-4 rounded-[var(--r-md)] border border-line-soft bg-cream/80 p-4'
            : 'rounded-[var(--r-md)] border border-line-soft bg-[#FBEAC4] p-4'
        }
        role="region"
        aria-label="Email verification"
      >
        <p className="m-0 mb-3 text-sm font-semibold text-ink">
          We sent a verification link to <span className="font-bold">{email.trim()}</span>. Open it
          to enable checkout.
        </p>
        <ResendVerificationButton />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className={
        compact
          ? 'mt-4 flex flex-col gap-3 rounded-[var(--r-md)] border border-line-soft bg-cream/80 p-4'
          : 'flex flex-col gap-3 rounded-[var(--r-md)] border border-line-soft bg-[#FBEAC4] p-4'
      }
      aria-labelledby="add-account-email-heading"
    >
      <h3 id="add-account-email-heading" className="m-0 text-sm font-extrabold text-ink">
        Add your email
      </h3>
      <p className="m-0 text-sm font-semibold text-ink-soft">
        We need a verified email before you can buy a day pass.
      </p>
      <label
        htmlFor="add-account-email"
        className="flex flex-col gap-2 text-sm font-bold text-ink-soft"
      >
        Email
        <input
          id="add-account-email"
          name="email"
          type="email"
          autoComplete="email"
          className="room-link-input w-full text-left font-body"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {error ? (
        <p className="m-0 text-sm font-bold text-red-deep" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary w-fit" disabled={submitting}>
        {submitting ? 'Sending link…' : 'Send verification link'}
      </button>
    </form>
  );
}
