/**
 * Mid-game overlay when AI/coach calls return 401 or 402.
 */
import { Link } from 'react-router-dom';

interface PlayAiAccessOverlayProps {
  kind: 'auth' | 'access';
  onRenew?: () => void;
}

export function PlayAiAccessOverlay({ kind, onRenew }: PlayAiAccessOverlayProps) {
  return (
    <div
      className="absolute inset-0 z-20 grid place-items-center bg-cream/85 backdrop-blur-[2px] p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="play-ai-access-title"
    >
      <div className="card max-w-md w-full p-6 text-center">
        <h2 id="play-ai-access-title" className="font-display font-extrabold text-xl m-0 mb-2">
          {kind === 'auth' ? 'Sign in to continue' : 'Day pass expired'}
        </h2>
        <p className="text-ink-soft font-semibold text-sm m-0 mb-5">
          {kind === 'auth'
            ? 'Your session ended. Sign in to keep playing against Master Lin (AI).'
            : 'Renew your day pass to resume this game with the AI opponent and coach.'}
        </p>
        {kind === 'auth' ? (
          <div className="flex gap-2 justify-center flex-wrap">
            <Link to="/login" className="btn btn-primary">
              Sign in
            </Link>
            <Link to="/register" className="btn btn-ghost">
              Register
            </Link>
          </div>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onRenew}>
            Add 24 hours · $1
          </button>
        )}
      </div>
    </div>
  );
}
