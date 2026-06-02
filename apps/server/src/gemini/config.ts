export function geminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}

export function gemmaModel(): string {
  return process.env.GEMMA_MODEL?.trim() || 'gemma-4-26b-a4b-it';
}

export function gemmaTimeoutMs(): number {
  const n = Number(process.env.GEMMA_TIMEOUT_MS ?? 25000);
  return Number.isFinite(n) && n > 0 ? n : 25000;
}

/** Max plies in Gemma “Recent history” prompt section (see GEMMA_HISTORY_LIMIT). */
export function gemmaHistoryLimit(): number {
  const n = Number(process.env.GEMMA_HISTORY_LIMIT ?? 150);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 150;
}

export function isGemmaConfigured(): boolean {
  return Boolean(geminiApiKey());
}

/**
 * Log Gemini `usageMetadata` to the server console after each successful `generateContent`.
 * Enabled when `NODE_ENV=development` (set by the server `dev` script) or `GEMMA_LOG_TOKENS=1`.
 * Set `GEMMA_LOG_TOKENS=0` to suppress in development.
 */
export function shouldLogGemmaTokenUsage(): boolean {
  const flag = process.env.GEMMA_LOG_TOKENS?.trim();
  if (flag === '0') return false;
  if (flag === '1') return true;
  return process.env.NODE_ENV === 'development';
}
