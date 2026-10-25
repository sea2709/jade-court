/**
 * Play with AI at `/play-ai`: gating, sign-out notice, checkout return polling.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ContinueSavedGameCard } from '../components/ContinueSavedGameCard';
import { PlayAiPaywall } from '../components/play-ai/PlayAiPaywall';
import { PlayAiPitch } from '../components/play-ai/PlayAiPitch';
import { useAuth } from '../context/useAuth';
import { usePlayAccessClock } from '../hooks/usePlayAccessClock';
import { useSavedGame } from '../hooks/useSavedGame';
import type { ActiveGameSave } from '../lib/gamesApi';
import { PlayAiGame } from './PlayAiGame';

type LocationNotice = { notice?: string };

const CHECKOUT_POLL_MS = 500;
const CHECKOUT_POLL_MAX = 20_000;

export function PlayAiScreen() {
  const { status, user, access, refresh } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<string | null>(() => {
    const state = location.state as LocationNotice | null;
    return state?.notice ?? null;
  });
  const [checkoutDone, setCheckoutDone] = useState(false);
  const [checkoutPollExhausted, setCheckoutPollExhausted] = useState(false);
  const accessUntil = user ? (access.accessUntil ?? user.accessUntil) : null;
  const { active: accessLive } = usePlayAccessClock(accessUntil);
  const hasActivePass = access.active && accessLive;
  const checkoutReturn = searchParams.get('checkout') === 'success';
  const checkoutWaiting =
    checkoutReturn && !checkoutDone && !hasActivePass && !checkoutPollExhausted;
  const savedAi = useSavedGame('ai');
  type AiSession = 'pending' | 'new' | ActiveGameSave;
  const [aiSession, setAiSession] = useState<AiSession>('pending');
  const showGame = status === 'ready' && user != null && hasActivePass;

  const showResumeGate =
    showGame &&
    !checkoutWaiting &&
    !savedAi.loading &&
    savedAi.save != null &&
    aiSession === 'pending';
  const showAiGame =
    showGame &&
    !checkoutWaiting &&
    !savedAi.loading &&
    (aiSession !== 'pending' || savedAi.save == null);

  useEffect(() => {
    const state = location.state as LocationNotice | null;
    if (state?.notice) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!checkoutReturn || checkoutDone || hasActivePass) return;
    const started = Date.now();
    let cancelled = false;

    const poll = async () => {
      while (!cancelled && Date.now() - started < CHECKOUT_POLL_MAX) {
        const me = await refresh();
        if (me.access.active) {
          setCheckoutDone(true);
          setSearchParams({}, { replace: true });
          return;
        }
        await new Promise((r) => setTimeout(r, CHECKOUT_POLL_MS));
      }
      if (!cancelled) setCheckoutPollExhausted(true);
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [checkoutReturn, checkoutDone, hasActivePass, refresh, setSearchParams]);

  return (
    <>
      {notice ? (
        <div className="page-notice" role="status">
          <p className="m-0 text-sm font-bold text-ink-soft">{notice}</p>
          <button
            type="button"
            className="page-notice-dismiss"
            aria-label="Dismiss notice"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      ) : null}
      {checkoutWaiting ? (
        <div
          className="page-container-md rise py-8 text-center text-muted font-bold"
          role="status"
          aria-live="polite"
        >
          Confirming payment…
        </div>
      ) : null}
      {status === 'ready' && !user ? <PlayAiPitch /> : null}
      {status === 'ready' && user && !hasActivePass && !checkoutWaiting ? (
        <PlayAiPaywall
          emailVerified={user.emailVerified}
          hasEmail={user.email != null && user.email.trim() !== ''}
        />
      ) : null}
      {showResumeGate ? (
        <div className="page-container-md rise py-6">
          <ContinueSavedGameCard
            save={savedAi.save!}
            onContinue={() => {
              if (savedAi.save) setAiSession(savedAi.save);
            }}
            onAbandon={async () => {
              await savedAi.abandon();
              setAiSession('new');
            }}
            abandonBusy={savedAi.abandonBusy}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setAiSession('new')}
          >
            Start a new game instead
          </button>
        </div>
      ) : null}
      {showAiGame ? (
        <PlayAiGame
          key={
            aiSession === 'pending' || aiSession === 'new'
              ? String(aiSession)
              : `${aiSession.updatedAt}-${aiSession.revision}`
          }
          accessUntil={accessUntil}
          preferredModelId={user.preferredModelId}
          resumeSave={aiSession !== 'pending' && aiSession !== 'new' ? aiSession : undefined}
          saved={savedAi}
        />
      ) : null}
    </>
  );
}
