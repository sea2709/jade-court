/**
 * Topbar avatar button with account menu (sign out, profile link).
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { formatAccessTimeLeft } from '../lib/formatAccessUntil';
import { playerLogout } from '../lib/playerAuthApi';

export const SIGN_OUT_NOTICE =
  "You're signed out. Your unfinished games are saved to your account.";

export const SIGN_OUT_FAILED_MESSAGE = 'Could not sign out. Check your connection and try again.';

function displayLabel(user: { displayName: string | null; email: string | null }): string {
  if (user.displayName?.trim()) return user.displayName.trim();
  if (user.email) return user.email;
  return 'Account';
}

function avatarInitial(user: { displayName: string | null; email: string | null }): string {
  const label = displayLabel(user);
  const ch = label.charAt(0).toUpperCase();
  return ch || '?';
}

/** Avatar trigger and dropdown menu for signed-in players. */
export function AccountAvatarMenu() {
  const { user, access, clearAuth } = useAuth();
  const navigate = useNavigate();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const first = menu?.querySelector<HTMLElement>('a[href], button:not([disabled])');
    first?.focus();
  }, [open]);

  if (!user) return null;

  const accessLabel = formatAccessTimeLeft(access.accessUntil ?? user.accessUntil);

  const onSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      await playerLogout();
      clearAuth();
      close();
      navigate('/play-ai', { state: { notice: SIGN_OUT_NOTICE } });
    } catch {
      setSignOutError(SIGN_OUT_FAILED_MESSAGE);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="relative ml-2 shrink-0" ref={rootRef}>
      <button
        type="button"
        className="account-avatar-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="account-avatar-initial" aria-hidden="true">
          {avatarInitial(user)}
        </span>
        <span className="sr-only">Account menu for {displayLabel(user)}</span>
      </button>
      {open ? (
        <div id={menuId} ref={menuRef} role="menu" className="account-menu" aria-label="Account">
          <div className="account-menu-header" role="presentation">
            <p className="account-menu-name">{displayLabel(user)}</p>
            {user.email ? <p className="account-menu-email">{user.email}</p> : null}
            {accessLabel ? <p className="account-menu-access">{accessLabel}</p> : null}
          </div>
          <Link to="/account" role="menuitem" className="account-menu-item" onClick={() => close()}>
            Account
          </Link>
          {signOutError ? (
            <p className="account-menu-error" role="alert">
              {signOutError}
            </p>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="account-menu-item account-menu-item-button"
            disabled={signingOut}
            onClick={() => void onSignOut()}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
