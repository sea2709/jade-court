/**
 * Play vs Computer at `/play-ai` (issue #76 sign-out landing).
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PlayScreen } from './PlayScreen';

type LocationNotice = { notice?: string };

/** Same as Play vs Computer, with optional flash notice from navigation state. */
export function PlayAiScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(() => {
    const state = location.state as LocationNotice | null;
    return state?.notice ?? null;
  });

  useEffect(() => {
    const state = location.state as LocationNotice | null;
    if (state?.notice) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

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
      <PlayScreen />
    </>
  );
}
