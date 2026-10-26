import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetIntegrationsStartupWarningsForTests,
  warnIntegrationsConfigAtStartup,
} from './startupWarnings.js';

describe('warnIntegrationsConfigAtStartup', () => {
  beforeEach(() => {
    resetIntegrationsStartupWarningsForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.FACEBOOK_APP_ID;
    delete process.env.FACEBOOK_APP_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    resetIntegrationsStartupWarningsForTests();
    vi.restoreAllMocks();
  });

  it('warns when Google client id is set without secret', () => {
    process.env.GOOGLE_CLIENT_ID = 'google-id';
    warnIntegrationsConfigAtStartup();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('GOOGLE_CLIENT_ID is set without GOOGLE_CLIENT_SECRET'),
    );
  });

  it('warns on partial Stripe billing env', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    warnIntegrationsConfigAtStartup();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('STRIPE_SECRET_KEY, STRIPE_PRICE_ID, and STRIPE_WEBHOOK_SECRET'),
    );
  });

  it('warns when resend is selected without API key', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    warnIntegrationsConfigAtStartup();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('RESEND_API_KEY is missing'));
  });

  it('logs each warning only once per process', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    warnIntegrationsConfigAtStartup();
    warnIntegrationsConfigAtStartup();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
