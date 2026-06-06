/**
 * LLM provider selection and env (LLM_* with GEMINI_* fallbacks for migration).
 */
import type { LlmProviderId } from './types.js';

const PROVIDERS: readonly LlmProviderId[] = ['gemini', 'openai', 'anthropic'];

export function llmProviderId(): LlmProviderId {
  const v = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (PROVIDERS.includes(v as LlmProviderId)) return v as LlmProviderId;
  return 'gemini';
}

export function apiKeyForProvider(id: LlmProviderId): string | undefined {
  switch (id) {
    case 'gemini':
      return process.env.GEMINI_API_KEY?.trim() || undefined;
    case 'openai':
      return process.env.OPENAI_API_KEY?.trim() || undefined;
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY?.trim() || undefined;
  }
}

export function defaultModelForProvider(id: LlmProviderId): string {
  switch (id) {
    case 'gemini':
      return 'gemma-4-26b-a4b-it';
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
  }
}

/** Resolved model id for the active (or given) provider. */
export function llmModel(id?: LlmProviderId): string {
  const provider = id ?? llmProviderId();
  const generic = process.env.LLM_MODEL?.trim();
  if (generic) return generic;
  if (provider === 'gemini') {
    const legacy = process.env.GEMINI_MODEL?.trim();
    if (legacy) return legacy;
  }
  return defaultModelForProvider(provider);
}

export function llmTimeoutMs(): number {
  const n = Number(process.env.LLM_TIMEOUT_MS ?? process.env.GEMINI_TIMEOUT_MS ?? 25000);
  return Number.isFinite(n) && n > 0 ? n : 25000;
}

/** Max plies in opponent “Recent history” prompt section. */
export function llmHistoryLimit(): number {
  const n = Number(process.env.LLM_HISTORY_LIMIT ?? process.env.GEMINI_HISTORY_LIMIT ?? 150);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 150;
}

export function isLlmConfigured(): boolean {
  return Boolean(apiKeyForProvider(llmProviderId()));
}

/**
 * Log token usage after successful LLM calls.
 * On when `NODE_ENV=development`, `LLM_LOG_TOKENS=1`, or legacy `GEMMA_LOG_TOKENS=1`.
 */
export function shouldLogLlmTokenUsage(): boolean {
  const flag = process.env.LLM_LOG_TOKENS?.trim() ?? process.env.GEMMA_LOG_TOKENS?.trim();
  if (flag === '0') return false;
  if (flag === '1') return true;
  return process.env.NODE_ENV === 'development';
}
