/**
 * Setup-screen card to resume or abandon a saved Play vs Computer / Play with AI game.
 */
import type { Difficulty, Side } from '@jade-court/xiangqi-engine';
import { Link } from 'react-router-dom';
import { LEVELS } from '../content/levels';
import { formatLastPlayed } from '../lib/formatGameTime';
import type { ActiveGameSave, AiGameConfig, PvcGameConfig } from '../lib/gamesApi';
import { SavedGameMiniBoard } from './SavedGameMiniBoard';

export interface ContinueSavedGameCardProps {
  save: ActiveGameSave;
  onContinue: () => void;
  onAbandon: () => void;
  abandonBusy?: boolean;
}

function sideLabel(side: Side): string {
  return side === 'r' ? 'Red 帥' : 'Black 將';
}

function levelName(level: Difficulty): string {
  return LEVELS.find((l) => l.id === level)?.name ?? level;
}

/** Continue / abandon card with mini board preview. */
function subtitleForSave(save: ActiveGameSave): string {
  if (save.mode === 'ai') {
    const cfg = save.config as AiGameConfig;
    return `${cfg.modelId} · ${levelName(cfg.difficulty)} · ${sideLabel(cfg.side)} · Move ${save.moves.length}`;
  }
  const cfg = save.config as PvcGameConfig;
  return `${levelName(cfg.level)} · ${sideLabel(cfg.side)} · Move ${save.moves.length}`;
}

export function ContinueSavedGameCard({
  save,
  onContinue,
  onAbandon,
  abandonBusy = false,
}: ContinueSavedGameCardProps) {
  const side =
    save.mode === 'ai' ? (save.config as AiGameConfig).side : (save.config as PvcGameConfig).side;
  const flip = side === 'b';

  return (
    <section
      className="card p-5 mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center"
      aria-label="Continue your game"
      data-testid="continue-saved-game"
    >
      <SavedGameMiniBoard moves={save.moves} flip={flip} />
      <div className="flex-1 min-w-0">
        <h2 className="m-0 font-display font-extrabold text-lg text-ink">Continue your game</h2>
        <p className="mt-1 mb-0 text-sm font-semibold text-ink-soft">{subtitleForSave(save)}</p>
        <p className="mt-1 mb-0 text-xs font-bold text-muted">
          Last played {formatLastPlayed(save.updatedAt)}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={onContinue}>
            Continue
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={abandonBusy}
            onClick={() => void onAbandon()}
          >
            {abandonBusy ? 'Abandoning…' : 'Abandon'}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Guest prompt on Play setup when saves require sign-in. */
export function SignInToSaveGamesNote() {
  return (
    <p className="text-sm font-semibold text-muted mb-6" data-testid="sign-in-to-save">
      <Link to="/login" className="text-jade-deep font-bold no-underline hover:underline">
        Sign in
      </Link>{' '}
      to save your games across devices.
    </p>
  );
}
