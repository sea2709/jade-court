import { llmTimeoutMs } from './config.js';

/** AbortSignal that fires after the configured LLM timeout. */
export function llmAbortSignal(extra?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), llmTimeoutMs());
  const onAbort = () => {
    clearTimeout(timer);
    controller.abort();
  };
  extra?.addEventListener('abort', onAbort, { once: true });
  controller.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timer);
      extra?.removeEventListener('abort', onAbort);
    },
    { once: true },
  );
  return controller.signal;
}
