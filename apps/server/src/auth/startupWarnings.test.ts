import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetPlayerAuthStartupWarningsForTests,
  warnPlayerAuthConfigAtStartup,
} from './startupWarnings.js';

describe('warnPlayerAuthConfigAtStartup', () => {
  beforeEach(() => {
    resetPlayerAuthStartupWarningsForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    resetPlayerAuthStartupWarningsForTests();
    vi.restoreAllMocks();
  });

  it('warns when SESSION_SECRET is missing', () => {
    delete process.env.SESSION_SECRET;
    warnPlayerAuthConfigAtStartup();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('SESSION_SECRET is missing'));
  });

  it('warns when SESSION_SECRET is short', () => {
    process.env.SESSION_SECRET = 'short';
    warnPlayerAuthConfigAtStartup();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('shorter than 32'));
  });
});
