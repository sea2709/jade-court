import { afterEach, describe, expect, it } from 'vitest';
import { isFakeOAuthEnabled } from './config.js';

const envSnapshot = { ...process.env };

describe('isFakeOAuthEnabled', () => {
  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it('is on in NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.OAUTH_FAKE_ENABLED;
    expect(isFakeOAuthEnabled()).toBe(true);
  });

  it('is off in production even with OAUTH_FAKE_ENABLED', () => {
    process.env.NODE_ENV = 'production';
    process.env.OAUTH_FAKE_ENABLED = '1';
    expect(isFakeOAuthEnabled()).toBe(false);
  });

  it('is on in development only when flag is set', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.OAUTH_FAKE_ENABLED;
    expect(isFakeOAuthEnabled()).toBe(false);
    process.env.OAUTH_FAKE_ENABLED = 'true';
    expect(isFakeOAuthEnabled()).toBe(true);
  });
});
