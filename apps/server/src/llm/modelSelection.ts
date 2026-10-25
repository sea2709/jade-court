/**
 * Resolve optional `modelId` to provider + model (env default when omitted).
 */
import { apiKeyForProvider, llmModel, llmProviderId } from './config.js';
import { findPresetById, isPresetAvailable } from './presets.js';
import type { LlmProviderId } from './types.js';

export interface LlmSelection {
  provider: LlmProviderId;
  model: string;
  /** Set when the call used a catalog preset id. */
  presetId?: string;
}

export function envDefaultSelection(): LlmSelection {
  const provider = llmProviderId();
  return { provider, model: llmModel(provider) };
}

export function isSelectionConfigured(selection: LlmSelection): boolean {
  return Boolean(apiKeyForProvider(selection.provider));
}

/**
 * When `modelId` is set, it must match an available preset.
 * When omitted, returns the env default provider/model.
 */
export function resolveLlmSelection(
  modelId?: string,
): { ok: true; selection: LlmSelection } | { ok: false; error: 'invalid_model' } {
  if (modelId === undefined || modelId === '') {
    return { ok: true, selection: envDefaultSelection() };
  }
  if (typeof modelId !== 'string') {
    return { ok: false, error: 'invalid_model' };
  }
  const preset = findPresetById(modelId);
  if (!preset || !isPresetAvailable(preset)) {
    return { ok: false, error: 'invalid_model' };
  }
  return {
    ok: true,
    selection: { provider: preset.provider, model: preset.model, presetId: preset.id },
  };
}

export type ParsedModelIdField =
  { ok: true; modelId?: string } | { ok: false; error: 'invalid_model' };

/**
 * Parse `modelId` from a JSON body.
 * Absent key → omit; present but not a non-empty string → invalid.
 */
export function parseModelIdField(body: Record<string, unknown>): ParsedModelIdField {
  if (!Object.prototype.hasOwnProperty.call(body, 'modelId')) {
    return { ok: true, modelId: undefined };
  }
  const raw = body.modelId;
  if (raw === undefined || raw === null) {
    return { ok: true, modelId: undefined };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'invalid_model' };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'invalid_model' };
  }
  return { ok: true, modelId: trimmed };
}
