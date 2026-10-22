/**
 * SMTP email sender (nodemailer).
 */
import nodemailer from 'nodemailer';
import { emailFromAddress, smtpHost, smtpPass, smtpPort, smtpSecure, smtpUser } from './config.js';
import type { EmailMessage, EmailSender } from './types.js';

export class SmtpEmailSender implements EmailSender {
  private transporter = nodemailer.createTransport({
    host: smtpHost(),
    port: smtpPort(),
    secure: smtpSecure(),
    auth:
      smtpUser() || smtpPass()
        ? {
            user: smtpUser(),
            pass: smtpPass(),
          }
        : undefined,
  });

  async send(message: EmailMessage): Promise<void> {
    if (!smtpHost()) {
      throw new Error('SMTP_HOST is not configured');
    }
    await this.transporter.sendMail({
      from: emailFromAddress(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
  }
}
