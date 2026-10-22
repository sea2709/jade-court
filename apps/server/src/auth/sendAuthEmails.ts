/**
 * Issue verification and password-reset emails (async from register / forgot-password).
 */
import { generateEmailToken, hashEmailToken } from './emailToken.js';
import { resetTokenTtlMs, verifyTokenTtlMs } from '../email/config.js';
import { resetPasswordLink, verifyEmailLink } from '../email/links.js';
import type { EmailSender } from '../email/types.js';
import type { EmailTokenStore } from '../emailTokens/store.js';
import type { UserRecord } from '../users/types.js';

export type AuthEmailDeps = {
  emailSender: EmailSender;
  emailTokenStore: EmailTokenStore;
};

function userEmail(user: UserRecord): string | null {
  return user.email ?? null;
}

/** Mint a verify token, persist hash, and send email. */
export async function sendVerificationEmail(deps: AuthEmailDeps, user: UserRecord): Promise<void> {
  const email = userEmail(user);
  if (!email || !user.passwordHash) return;

  await deps.emailTokenStore.deleteByUserIdAndKind(user.id, 'verify');

  const token = generateEmailToken();
  const tokenHash = hashEmailToken(token);
  const expiresAt = new Date(Date.now() + verifyTokenTtlMs());
  await deps.emailTokenStore.create({
    tokenHash,
    userId: user.id,
    kind: 'verify',
    expiresAt,
  });

  const link = verifyEmailLink(token);
  const subject = 'Verify your Jade Court email';
  const text = `Welcome to Jade Court.\n\nVerify your email address:\n${link}\n\nIf you did not create an account, you can ignore this message.`;

  await deps.emailSender.send({
    to: email,
    subject,
    text,
    html: `<p>Welcome to Jade Court.</p><p><a href="${link}">Verify your email address</a></p><p>If you did not create an account, you can ignore this message.</p>`,
  });
}

/** Mint a reset token, persist hash, and send email. */
export async function sendPasswordResetEmail(deps: AuthEmailDeps, user: UserRecord): Promise<void> {
  const email = userEmail(user);
  if (!email || !user.passwordHash) return;

  await deps.emailTokenStore.deleteByUserIdAndKind(user.id, 'reset');

  const token = generateEmailToken();
  const tokenHash = hashEmailToken(token);
  const expiresAt = new Date(Date.now() + resetTokenTtlMs());
  await deps.emailTokenStore.create({
    tokenHash,
    userId: user.id,
    kind: 'reset',
    expiresAt,
  });

  const link = resetPasswordLink(token);
  const subject = 'Reset your Jade Court password';
  const text = `We received a request to reset your password.\n\nReset your password:\n${link}\n\nIf you did not request this, you can ignore this message.`;

  await deps.emailSender.send({
    to: email,
    subject,
    text,
    html: `<p>We received a request to reset your password.</p><p><a href="${link}">Reset your password</a></p><p>If you did not request this, you can ignore this message.</p>`,
  });
}
