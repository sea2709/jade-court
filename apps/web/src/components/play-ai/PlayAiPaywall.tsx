/**
 * Day-pass paywall when signed in without active access.
 */
import { useEffect, useState } from 'react';
import { AddAccountEmailPanel } from '../account/AddAccountEmailPanel';
import { ResendVerificationButton } from '../ResendVerificationButton';
import { CoachAvatar } from '../CoachAvatar';
import { useAuth } from '../../context/useAuth';
import { fetchAiModels, type AiModelOption } from '../../lib/aiModelsApi';
import { assignCheckoutUrl, BillingApiError, postBillingCheckout } from '../../lib/billingApi';

interface PlayAiPaywallProps {
  emailVerified: boolean;
  hasEmail: boolean;
  onCheckoutStart?: () => void;
}

export function PlayAiPaywall({ emailVerified, hasEmail, onCheckoutStart }: PlayAiPaywallProps) {
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<AiModelOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchAiModels();
        if (!cancelled) setModels(res.models);
      } catch {
        if (!cancelled) setModels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const billingBlocked = !hasEmail
    ? 'Add an email to your account before purchasing a day pass.'
    : !emailVerified
      ? 'Verify your email before purchasing a day pass.'
      : null;

  const onBuy = async () => {
    if (billingBlocked) return;
    setBusy(true);
    setError(null);
    onCheckoutStart?.();
    try {
      const { url } = await postBillingCheckout();
      assignCheckoutUrl(url);
    } catch (err) {
      if (err instanceof BillingApiError && err.status === 503) {
        setError('Checkout is not available right now. Try again later or contact support.');
      } else if (err instanceof BillingApiError && err.code === 'email_not_verified') {
        setError('Verify your email before purchasing a day pass.');
      } else if (err instanceof BillingApiError && err.code === 'invalid_checkout_url') {
        setError('Checkout link was rejected. Try again later or contact support.');
      } else {
        setError('Could not start checkout. Check your connection and try again.');
      }
      setBusy(false);
    }
  };

  return (
    <div className="page-container-md rise">
      <span className="pill pill-gold mb-3.5">Day pass required</span>
      <h1 className="section-title">Unlock Play with AI</h1>
      <p className="section-subtitle max-w-[560px]">
        Play a full coached game against Master Lin — an AI opponent, not a person. $1 for 24 hours
        of access.
      </p>
      <div className="flex items-center gap-3 my-6 text-ink-soft font-bold text-sm">
        <CoachAvatar size={48} showAiTag />
        <span>Includes AI moves, move grading, hints, and chat with Master Lin (AI).</span>
      </div>
      {models.length > 0 ? (
        <div className="mb-6">
          <p className="m-0 mb-2 text-xs font-bold text-muted uppercase tracking-wide">
            AI models Master Lin can run on
          </p>
          <ul className="m-0 p-0 list-none flex flex-wrap gap-2" aria-label="Available AI models">
            {models.map((m) => (
              <li key={m.id}>
                <span className="pill pill-jade text-xs py-1 px-2.5">{m.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <button
        type="button"
        className="btn btn-primary btn-lg"
        disabled={busy || Boolean(billingBlocked)}
        onClick={() => void onBuy()}
      >
        {busy ? 'Opening checkout…' : 'Buy day pass · $1'}
      </button>
      {!hasEmail ? (
        <AddAccountEmailPanel compact onSaved={() => void refresh()} />
      ) : !emailVerified ? (
        <div
          className="mt-4 rounded-[var(--r-md)] border border-line-soft bg-cream/80 p-4"
          role="region"
          aria-label="Email verification"
        >
          <p className="m-0 mb-3 text-sm font-semibold text-ink-soft" role="status">
            {billingBlocked}
          </p>
          <ResendVerificationButton />
        </div>
      ) : billingBlocked ? (
        <p className="mt-4 text-sm font-semibold text-ink-soft" role="status">
          {billingBlocked}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm font-bold text-red-deep" role="alert">
          {error}
        </p>
      ) : null}
      <p className="mt-6 text-xs font-semibold text-muted max-w-[480px]">
        You&apos;ll complete payment securely on Stripe. Charges show as JADE COURT on your
        statement.
      </p>
    </div>
  );
}
