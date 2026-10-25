/**
 * Confirms abandoning an existing save before starting a new game.
 */
export interface ConfirmNewGameDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmNewGameDialog({ onConfirm, onCancel }: ConfirmNewGameDialogProps) {
  return (
    <div className="pop game-overlay" role="dialog" aria-labelledby="new-game-confirm-title">
      <div className="card p-6 max-w-md w-full shadow-lg" data-testid="new-game-confirm">
        <h2 id="new-game-confirm-title" className="m-0 font-display font-extrabold text-lg">
          Start a new game?
        </h2>
        <p className="mt-2 mb-0 text-sm font-semibold text-ink-soft">
          You have an unfinished game saved. Starting fresh will abandon that save.
        </p>
        <div className="mt-5 flex gap-2 justify-end">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-red btn-sm" onClick={onConfirm}>
            Abandon &amp; start new
          </button>
        </div>
      </div>
    </div>
  );
}
