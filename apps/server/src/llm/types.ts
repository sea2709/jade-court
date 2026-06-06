/**
 * Provider-agnostic LLM types (structured JSON now; text streaming in a later phase).
 */

export type LlmProviderId = 'gemini' | 'openai' | 'anthropic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonSchema = Record<string, any>;

export interface GenerateJsonParams {
  system: string;
  user: string;
  schema: JsonSchema;
  signal?: AbortSignal;
}

export interface StreamTextParams {
  system: string;
  user: string;
  signal?: AbortSignal;
}

export interface LlmUsage {
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly model: string;
  generateJson(params: GenerateJsonParams): Promise<string>;
  /** Phase 2: coach SSE streaming — stub throws until implemented. */
  streamText(params: StreamTextParams): AsyncIterable<string>;
}
