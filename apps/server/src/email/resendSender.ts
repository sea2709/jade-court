/**
 * Resend HTTP API email sender.
 */
import { emailFromAddress, resendApiKey } from './config.js';
import type { EmailMessage, EmailSender } from './types.js';

export class ResendEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    const apiKey = resendApiKey();
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFromAddress(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend API error ${res.status}: ${body.slice(0, 200)}`);
    }
  }
}
