/**
 * Factory for the configured EmailSender implementation.
 */
import { emailProviderId } from './config.js';
import { ConsoleEmailSender } from './consoleSender.js';
import { ResendEmailSender } from './resendSender.js';
import { SmtpEmailSender } from './smtpSender.js';
import type { EmailSender } from './types.js';

/** Resolve sender from `EMAIL_PROVIDER` (defaults to console). */
export function createEmailSender(): EmailSender {
  switch (emailProviderId()) {
    case 'resend':
      return new ResendEmailSender();
    case 'smtp':
      return new SmtpEmailSender();
    case 'console':
    default:
      return new ConsoleEmailSender();
  }
}
