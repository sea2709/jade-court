/**
 * Dev / test email sender — logs and captures messages for E2E outbox.
 */
import type { EmailMessage, EmailSender } from './types.js';

export type CapturedEmail = {
  to: string;
  subject: string;
  text: string;
  html: string | null;
  links: string[];
  sentAt: string;
};

const outbox: CapturedEmail[] = [];
const MAX_OUTBOX = 100;

const URL_RE = /https?:\/\/[^\s<>"']+/g;

function extractLinks(text: string, html?: string): string[] {
  const found = new Set<string>();
  for (const part of [text, html ?? '']) {
    for (const match of part.matchAll(URL_RE)) {
      found.add(match[0]);
    }
  }
  return [...found];
}

/** Last captured messages (newest last). */
export function getConsoleEmailOutbox(): CapturedEmail[] {
  return [...outbox];
}

/** Clear capture buffer (Vitest only). */
export function resetConsoleEmailOutboxForTests(): void {
  outbox.length = 0;
}

export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    const captured: CapturedEmail = {
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ?? null,
      links: extractLinks(message.text, message.html),
      sentAt: new Date().toISOString(),
    };
    outbox.push(captured);
    if (outbox.length > MAX_OUTBOX) {
      outbox.splice(0, outbox.length - MAX_OUTBOX);
    }
    console.log(`[email:console] to=${message.to} subject=${message.subject}`);
    console.log(message.text);
  }
}
