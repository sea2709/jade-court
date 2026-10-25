/**
 * Load, autosave, and abandon in-progress Play vs Computer / Play with AI games.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../components/coach/types';
import { useAuth } from '../context/useAuth';
import {
  deleteActiveGame,
  fetchActiveGame,
  GamesApiError,
  putActiveGame,
  type ActiveGameSave,
  type PutActiveGameBody,
  type SavedGameConfig,
  type SavedGameMode,
  type SavedMovePly,
} from '../lib/gamesApi';
import { messageForGamesSaveError } from '../lib/gamesApiErrors';

export const STALE_REVISION_MESSAGE = 'This game changed in another tab — reload it';

const AUTOSAVE_DEBOUNCE_MS = 500;

export interface SavedGameSnapshot {
  config: SavedGameConfig;
  moves: SavedMovePly[];
  chat?: ChatMessage[];
}

export interface UseSavedGameResult {
  /** True when the player session is ready and signed in. */
  signedIn: boolean;
  loading: boolean;
  save: ActiveGameSave | null;
  staleRevisionError: string | null;
  /** Non-409 autosave failures (network, 400, 500). Cleared on successful PUT. */
  saveError: string | null;
  abandonBusy: boolean;
  refresh: () => Promise<void>;
  /** Fetches server save, updates hook state, clears stale/save errors; returns save for remount. */
  reloadFromServer: () => Promise<ActiveGameSave | null>;
  abandon: () => Promise<void>;
  clearStaleError: () => void;
  clearSaveError: () => void;
  /** Debounced PUT; skipped when `enabled` is false. */
  scheduleAutosave: (snapshot: SavedGameSnapshot, opts?: { enabled?: boolean }) => void;
  /** Flush any pending autosave immediately (tests). */
  flushAutosave: () => Promise<void>;
}

export function useSavedGame(mode: SavedGameMode): UseSavedGameResult {
  const { status, user } = useAuth();
  const signedIn = status === 'ready' && user != null;

  const [loading, setLoading] = useState(signedIn);
  const [save, setSave] = useState<ActiveGameSave | null>(null);
  const [staleRevisionError, setStaleRevisionError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [abandonBusy, setAbandonBusy] = useState(false);

  const revisionRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ body: PutActiveGameBody; enabled: boolean } | null>(null);
  const inFlightRef = useRef(false);
  /** Bumped on reload/abandon so late PUT responses cannot overwrite a fresh server load. */
  const saveGenerationRef = useRef(0);

  const applySave = useCallback((next: ActiveGameSave | null) => {
    setSave(next);
    revisionRef.current = next?.revision ?? 0;
  }, []);

  const cancelPendingAutosave = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    pendingRef.current = null;
  }, []);

  const bumpSaveGeneration = useCallback(() => {
    saveGenerationRef.current += 1;
  }, []);

  const loadFromServer = useCallback(async (): Promise<ActiveGameSave | null> => {
    if (!signedIn) {
      applySave(null);
      return null;
    }
    const loaded = await fetchActiveGame(mode);
    applySave(loaded);
    return loaded;
  }, [applySave, mode, signedIn]);

  const refresh = useCallback(async () => {
    if (!signedIn) {
      applySave(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const loaded = await loadFromServer();
      if (loaded) {
        setStaleRevisionError(null);
        setSaveError(null);
      }
    } catch {
      applySave(null);
      setSaveError(messageForGamesSaveError(new TypeError('fetch failed')));
    } finally {
      setLoading(false);
    }
  }, [applySave, loadFromServer, signedIn]);

  const reloadFromServer = useCallback(async (): Promise<ActiveGameSave | null> => {
    if (!signedIn) return null;
    bumpSaveGeneration();
    cancelPendingAutosave();
    setLoading(true);
    try {
      const loaded = await loadFromServer();
      setStaleRevisionError(null);
      setSaveError(null);
      return loaded;
    } catch (err) {
      setSaveError(messageForGamesSaveError(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [bumpSaveGeneration, cancelPendingAutosave, loadFromServer, signedIn]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- load save when auth becomes ready */
    void refresh();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refresh]);

  const runPut = useCallback(
    async (body: PutActiveGameBody) => {
      if (!signedIn) return;
      const putGeneration = saveGenerationRef.current;
      inFlightRef.current = true;
      const putDone = (async () => {
        try {
          const payload: PutActiveGameBody = {
            ...body,
            baseRevision: revisionRef.current > 0 ? revisionRef.current : undefined,
          };
          const result = await putActiveGame(mode, payload);
          if (putGeneration !== saveGenerationRef.current) return;

          if ('finished' in result) {
            applySave(null);
            setSaveError(null);
            setStaleRevisionError(null);
            return;
          }
          applySave(result);
          setStaleRevisionError(null);
          setSaveError(null);
        } catch (err) {
          if (putGeneration !== saveGenerationRef.current) return;
          if (err instanceof GamesApiError && err.code === 'stale_revision') {
            setStaleRevisionError(STALE_REVISION_MESSAGE);
            return;
          }
          setSaveError(messageForGamesSaveError(err));
        } finally {
          inFlightRef.current = false;
        }
      })();
      await putDone;
    },
    [applySave, mode, signedIn],
  );

  const flushAutosave = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending?.enabled || !signedIn) return;
    await runPut(pending.body);
  }, [runPut, signedIn]);

  const scheduleAutosave = useCallback(
    (snapshot: SavedGameSnapshot, opts?: { enabled?: boolean }) => {
      const enabled = opts?.enabled ?? true;
      if (!signedIn || !enabled) return;

      const body: PutActiveGameBody = {
        config: snapshot.config,
        moves: snapshot.moves,
        ...(snapshot.chat !== undefined ? { chat: snapshot.chat } : {}),
      };
      pendingRef.current = { body, enabled: true };

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void flushAutosave();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [flushAutosave, signedIn],
  );

  const abandon = useCallback(async () => {
    if (!signedIn) return;
    bumpSaveGeneration();
    cancelPendingAutosave();
    setAbandonBusy(true);
    try {
      await deleteActiveGame(mode);
      applySave(null);
      setStaleRevisionError(null);
      setSaveError(null);
    } finally {
      setAbandonBusy(false);
    }
  }, [applySave, bumpSaveGeneration, cancelPendingAutosave, mode, signedIn]);

  const clearStaleError = useCallback(() => setStaleRevisionError(null), []);
  const clearSaveError = useCallback(() => setSaveError(null), []);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  return {
    signedIn,
    loading,
    save,
    staleRevisionError,
    saveError,
    abandonBusy,
    refresh,
    reloadFromServer,
    abandon,
    clearStaleError,
    clearSaveError,
    scheduleAutosave,
    flushAutosave,
  };
}
