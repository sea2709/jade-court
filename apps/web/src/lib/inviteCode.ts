/**
 * Room invite code helpers. Server codes look like `JADE-XXXX`; players only ever
 * see, copy, and type the four characters after the fixed `JADE-` prefix.
 */

export const INVITE_CODE_PREFIX = 'JADE-';
export const INVITE_CODE_LENGTH = 4;

/**
 * Four-character suffix from a full code, a pasted `JADE-XXXX`, an invite link,
 * or partially typed input. Uppercases, drops non-alphanumerics, caps at four.
 */
export function inviteCodeSuffix(raw: string): string {
  // Only strip the prefix when a separator follows it — `JADE` alone is a valid suffix.
  const rest =
    raw
      .toUpperCase()
      .split(/JADE[-–]/)
      .pop() ?? '';
  return rest.replace(/[^A-Z0-9]/g, '').slice(0, INVITE_CODE_LENGTH);
}

/** Full server code (`JADE-XXXX`) for a four-character suffix. */
export function fullInviteCode(suffix: string): string {
  return `${INVITE_CODE_PREFIX}${inviteCodeSuffix(suffix)}`;
}
