/**
 * Day-pass paywall when signed in without active access.
 */
import { useState } from 'react';
import { CoachAvatar } from '../CoachAvatar';
import { assignCheckoutUrl, BillingApiError, postBillingCheckout } from '../../lib/billingApi';

interface PlayAiPaywallProps {
  onCheckoutStart?: () => void;
}

export function PlayAiPaywall({ onCheckoutStart }: PlayAiPaywallProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onBuy = async () => {
    setBusy(true);
    setError(null);
    onCheckoutStart?.();
    try {
      const { url } = await postBillingCheckout();
      assignCheckoutUrl(url);
    } catch (err) {
      if (err instanceof BillingApiError && err.status === 503) {
        setError('Checkout is not available right now. Try again later or contact support.');
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
        Play a full coached game against Master Lin — an AI opponent, not a person. Add 24 hours of
        access for $1.
      </p>
      <div className="flex items-center gap-3 my-6 text-ink-soft font-bold text-sm">
        <CoachAvatar size={48} showAiTag />
        <span>Includes AI moves, move grading, hints, and chat with Master Lin (AI).</span>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-lg"
        disabled={busy}
        onClick={() => void onBuy()}
      >
        {busy ? 'Opening checkout…' : 'Add 24 hours · $1'}
      </button>
      {error ? (
        <p className="mt-4 text-sm font-bold text-red-deep" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
