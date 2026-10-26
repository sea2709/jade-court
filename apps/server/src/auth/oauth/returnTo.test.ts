import { describe, expect, it } from 'vitest';
import { isAllowedReturnTo, normalizeReturnTo } from './returnTo.js';

describe('oauth returnTo', () => {
  it('allows root-relative paths', () => {
    expect(isAllowedReturnTo('/')).toBe(true);
    expect(isAllowedReturnTo('/play-ai')).toBe(true);
    expect(normalizeReturnTo('/account')).toBe('/account');
  });

  it('rejects absolute URLs and protocol-relative paths', () => {
    expect(isAllowedReturnTo('https://evil.com')).toBe(false);
    expect(isAllowedReturnTo('//evil.com')).toBe(false);
    expect(normalizeReturnTo('https://evil.com/phish')).toBe('/');
  });

  it('defaults empty or invalid returnTo to /', () => {
    expect(normalizeReturnTo(undefined)).toBe('/');
    expect(normalizeReturnTo('   ')).toBe('/');
  });
});
