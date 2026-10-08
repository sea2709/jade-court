import { createLogger, type Logger } from 'vite';
import { isBenignE2eProxyLog } from './src/lib/e2eProxyLogFilter.js';

/** Suppress benign WebSocket proxy resets when Playwright shuts down room tests. */
export function createE2eQuietLogger(): Logger {
  const logger = createLogger(undefined, { allowClearScreen: false });

  const wrap =
    (fn: Logger['warn']) =>
    (msg: unknown, options?: { timestamp?: boolean }) => {
      if (isBenignE2eProxyLog(msg)) return;
      fn(msg as string, options);
    };

  logger.warn = wrap(logger.warn.bind(logger));
  logger.error = wrap(logger.error.bind(logger));
  return logger;
}
