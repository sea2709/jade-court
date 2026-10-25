/**
 * Account page list of in-progress saves with resume and abandon actions.
 */
import { Link } from 'react-router-dom';
import { LEVELS } from '../../content/levels';
import { formatLastPlayed } from '../../lib/formatGameTime';
import type { ActiveGameSummary, SavedGameMode } from '../../lib/gamesApi';
import { SavedGameMiniBoard } from '../SavedGameMiniBoard';

export interface UnfinishedGamesSectionProps {
  games: ActiveGameSummary[];
  onAbandon: (mode: SavedGameMode) => void;
  abandonBusyMode: SavedGameMode | null;
}

function modeTitle(mode: SavedGameMode): string {
  return mode === 'pvc' ? 'Play vs Computer' : 'Play with AI';
}

function modePath(mode: SavedGameMode): string {
  return mode === 'pvc' ? '/play' : '/play-ai';
}

function detailLine(game: ActiveGameSummary): string {
  if (game.mode === 'pvc' && game.level) {
    const name = LEVELS.find((l) => l.id === game.level)?.name ?? game.level;
    return `${name} · Move ${game.moveCount}`;
  }
  if (game.mode === 'ai') {
    return `${game.modelId ?? 'AI'} · Move ${game.moveCount}`;
  }
  return `Move ${game.moveCount}`;
}

/** Rows from `GET /api/games/active`. */
export function UnfinishedGamesSection({
  games,
  onAbandon,
  abandonBusyMode,
}: UnfinishedGamesSectionProps) {
  if (games.length === 0) return null;

  return (
    <section className="mt-10" aria-label="Unfinished games">
      <h2 className="font-display font-extrabold text-xl text-ink mb-4">Unfinished games</h2>
      <ul className="m-0 p-0 list-none flex flex-col gap-3">
        {games.map((game) => (
          <li
            key={game.mode}
            className="card p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center"
            data-testid={`unfinished-game-${game.mode}`}
          >
            <SavedGameMiniBoard moves={[]} cell={24} flip={game.side === 'b'} />
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-ink">{modeTitle(game.mode)}</div>
              <div className="text-sm font-semibold text-ink-soft">{detailLine(game)}</div>
              <div className="text-xs font-bold text-muted mt-0.5">
                Last played {formatLastPlayed(game.updatedAt)}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link to={modePath(game.mode)} className="btn btn-primary btn-sm">
                Resume
              </Link>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={abandonBusyMode === game.mode}
                onClick={() => onAbandon(game.mode)}
              >
                {abandonBusyMode === game.mode ? 'Abandoning…' : 'Abandon'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
