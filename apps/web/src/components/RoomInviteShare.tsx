/**
 * Invite code display (JADE prefix + letter boxes) and copy actions for the host's
 * in-game sidebar while waiting; sized to fit the 300px game sidebar.
 */
import { useState } from 'react';
import { inviteCodeSuffix } from '../lib/inviteCode';
import { InviteCodeBoxes } from './InviteCode';

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

function canUseWebShare(inviteLink: string): boolean {
  return (
    typeof navigator.share === 'function' && navigator.canShare?.({ url: inviteLink }) === true
  );
}

/** Muted prefix + four boxed characters; Share invite (Web Share) and copy actions with feedback. */
export function RoomInviteShare({ code, inviteLink }: RoomInviteShareProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const webShareAvailable = canUseWebShare(inviteLink);
  const suffix = inviteCodeSuffix(code);

  const onCopyLink = () => {
    void copyText(inviteLink).then((ok) => {
      if (!ok) return;
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1600);
    });
  };

  const onCopyCode = () => {
    void copyText(suffix).then((ok) => {
      if (!ok) return;
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1600);
    });
  };

  const onShareInvite = () => {
    if (sharePending || !webShareAvailable) return;
    setShareError(null);
    setSharePending(true);
    void navigator
      .share({
        title: 'Play Xiangqi with me',
        text: `Join my Jade Court room ${code}`,
        url: inviteLink,
      })
      .catch(async (err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const ok = await copyText(inviteLink);
        if (ok) {
          setCopiedShare(true);
          setTimeout(() => setCopiedShare(false), 1600);
        } else {
          setShareError("Couldn't share — use Copy link");
        }
      })
      .finally(() => {
        setSharePending(false);
      });
  };

  return (
    <div data-testid="room-invite-share">
      <div className="mb-[18px]">
        <InviteCodeBoxes chars={suffix} />
      </div>

      {webShareAvailable ? (
        <div className="mb-3">
          <button
            type="button"
            className="btn btn-primary btn-sm w-full"
            disabled={sharePending}
            onClick={onShareInvite}
          >
            {copiedShare ? '✓ Copied' : 'Share invite'}
          </button>
          {shareError ? (
            <p className="text-xs text-muted mt-1.5 text-center" role="status">
              {shareError}
            </p>
          ) : null}
        </div>
      ) : null}

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
