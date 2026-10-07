/** Thrown when the active provider has no API key configured. */
export const LLM_UNCONFIGURED = 'llm_unconfigured';

export function assertLlmConfigured(hasKey: boolean): void {
  if (!hasKey) throw new Error(LLM_UNCONFIGURED);
}

/** Phase 2 placeholder for coach text streaming. */
// eslint-disable-next-line require-yield -- must stay a generator to satisfy the provider `streamText` shape
export async function* streamTextNotImplemented(): AsyncIterable<string> {
  throw new Error('llm_stream_not_implemented');
}
