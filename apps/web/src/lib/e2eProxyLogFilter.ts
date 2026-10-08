/** Benign teardown noise from Vite’s `/ws` proxy during Playwright multiplayer specs. */
export function isBenignE2eProxyLog(msg: unknown): boolean {
  const text =
    typeof msg === 'string'
      ? msg
      : msg instanceof Error
        ? msg.message
        : msg != null
          ? String(msg)
          : '';
  return (
    text.includes('ws proxy socket error') ||
    text.includes('ECONNRESET') ||
    text.includes('EPIPE')
  );
}
