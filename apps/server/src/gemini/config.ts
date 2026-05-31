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

export function isGemmaConfigured(): boolean {
  return Boolean(geminiApiKey());
}
