/**
 * Resend verification email for signed-in users with unverified email.
 */
import { useState } from 'react';
import { PlayerAuthApiError, playerResendVerification } from '../lib/playerAuthApi';

function resendErrorMessage(err: unknown): string {
  if (!(err instanceof PlayerAuthApiError)) {
    return 'Could not resend. Try again.';
  }
  switch (err.code) {
    case 'unauthorized':
      return 'Sign in again to resend the email.';
    case 'rate_limited':
      return 'Too many resend attempts. Try again in a few minutes.';
    default:
      return 'Could not resend. Try again.';
  }
}

export type ResendVerificationButtonProps = {
  /** Called after a successful resend (optional). */
  onSent?: () => void;
};

/** Button that POSTs `/api/auth/resend-verification` for the current session. */
export function ResendVerificationButton({ onSent }: ResendVerificationButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await playerResendVerification();
      setSent(true);
      onSent?.();
    } catch (err) {
      setError(resendErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="btn btn-ghost w-fit"
        disabled={submitting}
        onClick={() => void onClick()}
      >
        {submitting ? 'Sending…' : sent ? 'Email sent again' : 'Resend verification email'}
      </button>
      {error ? (
        <p className="text-sm font-bold text-red-deep m-0" role="alert">
          {error}
        </p>
      ) : null}
      {sent && !error ? (
        <p className="text-sm font-semibold text-muted m-0" role="status">
          Check your inbox for a new link.
        </p>
      ) : null}
    </div>
  );
}
