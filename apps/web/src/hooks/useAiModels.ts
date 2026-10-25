/**
 * Loads `/api/ai/models` and tracks the selected model id.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAiModels, type AiModelOption } from '../lib/aiModelsApi';
import { GemmaApiError } from '../lib/gemmaApi';

export type AiModelsStatus = 'loading' | 'ready' | 'unavailable';

/** First candidate id that exists in the loaded catalog (ignores stale prefs / defaultId). */
function firstModelIdInList(
  candidates: (string | null | undefined)[],
  models: AiModelOption[],
): string | null {
  const available = new Set(models.map((m) => m.id));
  for (const id of candidates) {
    if (id && available.has(id)) return id;
  }
  return null;
}

export function useAiModels(preferredModelId: string | null) {
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [userModelId, setUserModelId] = useState<string | null>(null);
  const [status, setStatus] = useState<AiModelsStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchAiModels();
        if (cancelled) return;
        setModels(res.models);
        const apiDefault = res.defaultId || res.models[0]?.id || '';
        const resolvedDefault = res.models.some((m) => m.id === apiDefault)
          ? apiDefault
          : (res.models[0]?.id ?? '');
        setDefaultId(resolvedDefault || null);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        const unavailable =
          err instanceof GemmaApiError && (err.status === 404 || err.status === 503);
        setStatus(unavailable ? 'unavailable' : 'ready');
        setModels([]);
        setDefaultId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const modelId = useMemo(
    () => firstModelIdInList([userModelId, preferredModelId, defaultId], models),
    [userModelId, preferredModelId, defaultId, models],
  );

  const selectedModel = useMemo(
    () => (modelId ? models.find((m) => m.id === modelId) : undefined),
    [modelId, models],
  );

  const modelLabel = useMemo(() => {
    if (!modelId) return 'default model';
    return selectedModel?.label ?? modelId;
  }, [modelId, selectedModel]);

  /** Board caption after "running …" — label plus optional preset blurb. */
  const modelRunningCaption = useMemo(() => {
    if (!modelId) return 'default model';
    const label = selectedModel?.label ?? modelId;
    const blurb = selectedModel?.blurb?.trim();
    return blurb ? `${label} · ${blurb}` : label;
  }, [modelId, selectedModel]);

  const pickModel = useCallback((id: string) => {
    setUserModelId(id);
  }, []);

  return {
    models,
    modelId,
    modelLabel,
    modelRunningCaption,
    status,
    pickModel,
    modelsDisabled: status === 'unavailable' || models.length === 0,
  };
}
