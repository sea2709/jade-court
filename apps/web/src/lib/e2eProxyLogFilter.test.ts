import { describe, expect, it } from 'vitest';
import { isBenignE2eProxyLog } from './e2eProxyLogFilter.js';

describe('isBenignE2eProxyLog', () => {
  it('matches Vite ws proxy teardown messages', () => {
    expect(isBenignE2eProxyLog('[vite] ws proxy socket error:')).toBe(true);
    expect(isBenignE2eProxyLog(new Error('read ECONNRESET'))).toBe(true);
    expect(isBenignE2eProxyLog('write EPIPE')).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isBenignE2eProxyLog('Failed to resolve import')).toBe(false);
    expect(isBenignE2eProxyLog(new Error('ENOENT'))).toBe(false);
  });
});
