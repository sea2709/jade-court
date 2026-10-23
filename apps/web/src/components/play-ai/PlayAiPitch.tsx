/**
 * Signed-out marketing pitch for Play with AI.
 */
import { Link } from 'react-router-dom';
import { CoachAvatar } from '../CoachAvatar';

export function PlayAiPitch() {
  return (
    <div className="page-container-md rise">
      <span className="pill pill-jade mb-3.5">Play with AI</span>
      <h1 className="section-title">Play with Master Lin (AI)</h1>
      <p className="section-subtitle max-w-[560px]">
        Face an AI opponent that talks back — Master Lin plays Black, grades your moves, and answers
        questions in chat. He is software, not a human coach.
      </p>
      <div className="flex items-center gap-3 my-6 text-ink-soft font-bold text-sm">
        <CoachAvatar size={48} showAiTag />
        <span>Master Lin is an AI player and coach. Moves and advice can be wrong.</span>
      </div>
      <div className="flex gap-3 flex-wrap">
        <Link to="/login" className="btn btn-primary btn-lg">
          Sign in
        </Link>
        <Link to="/register" className="btn btn-ghost btn-lg">
          Create account
        </Link>
      </div>
      <p className="mt-6 text-sm text-muted font-semibold">
        A day pass unlocks 24 hours of Play with AI. Sign in to purchase or restore access.
      </p>
    </div>
  );
}
