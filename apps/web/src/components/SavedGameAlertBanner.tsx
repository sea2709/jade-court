/**
 * Stale revision or autosave failure banner during an active game.
 */
export interface SavedGameAlertBannerProps {
  staleRevisionError: string | null;
  saveError: string | null;
  onReloadSave: () => void;
}

export function SavedGameAlertBanner({
  staleRevisionError,
  saveError,
  onReloadSave,
}: SavedGameAlertBannerProps) {
  if (!staleRevisionError && !saveError) return null;

  return (
    <div
      className="mb-3 rounded-[var(--r-md)] border border-gold-deep bg-[#FBEAC4] p-3"
      role="alert"
      data-testid="saved-game-alert"
    >
      {staleRevisionError ? (
        <p className="m-0 text-sm font-bold text-ink">{staleRevisionError}</p>
      ) : null}
      {saveError ? (
        <p className={`m-0 text-sm font-bold text-ink ${staleRevisionError ? 'mt-2' : ''}`}>
          {saveError}
        </p>
      ) : null}
      {staleRevisionError ? (
        <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={onReloadSave}>
          Reload save
        </button>
      ) : null}
    </div>
  );
}
