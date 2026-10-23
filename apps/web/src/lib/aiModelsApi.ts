/**
 * LLM model list for Play with AI (`GET /api/ai/models`).
 */
import { getGuestId } from './guestId';
import { GemmaApiError } from './gemmaApi';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface AiModelOption {
  id: string;
  label: string;
  blurb?: string;
}

export interface AiModelsResponse {
  models: AiModelOption[];
  defaultId: string;
}

/** Loads selectable opponent/coach models; throws on unexpected HTTP errors. */
export async function fetchAiModels(): Promise<AiModelsResponse> {
  const res = await fetch(`${API_BASE}/api/ai/models`, {
    headers: { 'x-guest-id': getGuestId() },
    credentials: 'include',
  });
  const data = (await res.json().catch(() => ({}))) as AiModelsResponse & { error?: string };
  if (!res.ok) {
    throw new GemmaApiError(data.error ?? res.statusText, res.status, data.error);
  }
  const models = Array.isArray(data.models) ? data.models : [];
  const defaultId = typeof data.defaultId === 'string' ? data.defaultId : (models[0]?.id ?? '');
  return { models, defaultId };
}
