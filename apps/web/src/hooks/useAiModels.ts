/**
 * Loads `/api/ai/models` and tracks the selected model id.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAiModels, type AiModelOption } from '../lib/aiModelsApi';
import { GemmaApiError } from '../lib/gemmaApi';

export type AiModelsStatus = 'loading' | 'ready' | 'unavailable';

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
        setDefaultId(res.defaultId || res.models[0]?.id || null);
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

  const modelId = userModelId ?? preferredModelId ?? defaultId ?? models[0]?.id ?? null;

  const modelLabel = useMemo(() => {
    if (!modelId) return 'default model';
    return models.find((m) => m.id === modelId)?.label ?? modelId;
  }, [modelId, models]);

  const pickModel = useCallback((id: string) => {
    setUserModelId(id);
  }, []);

  return {
    models,
    modelId,
    modelLabel,
    status,
    pickModel,
    modelsDisabled: status === 'unavailable' || models.length === 0,
  };
}
