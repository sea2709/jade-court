/**
 * Invite code display (JADE prefix + letter boxes) and copy actions for lobby / waiting room.
 */
import { useState } from 'react';

export type RoomInviteShareProps = {
  code: string;
  /** Full multiplayer URL including `?room=` */
  inviteLink: string;
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* secure-context or permission failures — try legacy fallback */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Muted prefix + four boxed characters; Copy link and Copy code with per-action feedback. */
export function RoomInviteShare({ code, inviteLink }: RoomInviteShareProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const suffix = code.startsWith('JADE-') ? code.slice(5) : code.replace(/^JADE-?/, '');

  const onCopyLink = () => {
    void copyText(inviteLink).then((ok) => {
      if (!ok) return;
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1600);
    });
  };

  const onCopyCode = () => {
    void copyText(code).then((ok) => {
      if (!ok) return;
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1600);
    });
  };

  return (
    <div data-testid="room-invite-share">
      <div className="flex justify-center items-center gap-2 mb-[18px]">
        <span className="font-display font-extrabold text-muted tracking-[3px] text-[22px] select-none">
          J A D E –
        </span>
        <div className="flex gap-2">
          {suffix.split('').map((ch, i) => (
            <span key={i} className="invite-code-char" data-testid="invite-code-char">
              {ch}
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <input readOnly value={inviteLink} className="room-link-input" aria-label="Invite link" />
        <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={onCopyLink}>
          {copiedLink ? '✓ Copied' : 'Copy link'}
        </button>
      </div>

      <button type="button" className="btn btn-ghost btn-sm w-full mb-1" onClick={onCopyCode}>
        {copiedCode ? '✓ Copied' : 'Copy code'}
      </button>
    </div>
  );
}
