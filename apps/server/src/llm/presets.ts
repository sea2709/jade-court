/**
 * Selectable AI model presets (Play with AI / Master Lin).
 */
import { apiKeyForProvider, llmModel, llmProviderId } from './config.js';
import type { LlmProviderId } from './types.js';

export interface AiModelPreset {
  id: string;
  label: string;
  provider: LlmProviderId;
  model: string;
  blurb?: string;
}

/** Stable preset ids referenced by the web client (`gemini-flash`, etc.). */
export const AI_MODEL_PRESETS: readonly AiModelPreset[] = [
  {
    id: 'gemini-flash',
    label: 'Gemini Flash',
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    blurb: 'Fast, low-latency replies',
  },
  {
    id: 'gemma-4',
    label: 'Gemma 4',
    provider: 'gemini',
    model: 'gemma-4-26b-a4b-it',
    blurb: 'Balanced on-device style model',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    blurb: 'Cost-efficient OpenAI',
  },
  {
    id: 'claude-haiku',
    label: 'Claude Haiku',
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    blurb: 'Quick Anthropic replies',
  },
  {
    id: 'claude-sonnet',
    label: 'Claude Sonnet',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    blurb: 'Stronger coaching depth',
  },
];

export interface PublicAiModelOption {
  id: string;
  label: string;
  blurb?: string;
}

/** Preset is available when its provider API key is configured. */
export function isPresetAvailable(preset: AiModelPreset): boolean {
  return Boolean(apiKeyForProvider(preset.provider));
}

export function findPresetById(id: string): AiModelPreset | undefined {
  return AI_MODEL_PRESETS.find((p) => p.id === id);
}

/** Presets with configured provider keys, in catalog order. */
export function listAvailablePresets(): AiModelPreset[] {
  return AI_MODEL_PRESETS.filter(isPresetAvailable);
}

export function toPublicModelOption(preset: AiModelPreset): PublicAiModelOption {
  return {
    id: preset.id,
    label: preset.label,
    ...(preset.blurb ? { blurb: preset.blurb } : {}),
  };
}

/** Default preset id from env when it matches an available preset, else first available, else null. */
export function defaultPresetId(): string | null {
  const available = listAvailablePresets();
  if (!available.length) return null;
  const provider = llmProviderId();
  const model = llmModel(provider);
  const exact = available.find((p) => p.provider === provider && p.model === model);
  if (exact) return exact.id;
  const byProvider = available.find((p) => p.provider === provider);
  if (byProvider) return byProvider.id;
  return available[0].id;
}
