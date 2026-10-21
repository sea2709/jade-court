/**
 * Player session context: loads `/api/me` on mount and exposes auth actions.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchPlayerMe, type MeAccess, type PublicUser } from '../lib/playerAuthApi';
import { AuthContext, type AuthStatus } from './authContext';

const defaultAccess: MeAccess = { active: false, accessUntil: null };

/** Provides player auth state from the session cookie. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [access, setAccess] = useState<MeAccess>(defaultAccess);

  const applyMe = useCallback((me: { user: PublicUser | null; access: MeAccess }) => {
    setUser(me.user);
    setAccess(me.access);
    setStatus('ready');
  }, []);

  const refresh = useCallback(async () => {
    const me = await fetchPlayerMe();
    applyMe(me);
  }, [applyMe]);

  const setSignedIn = useCallback((signedInUser: PublicUser) => {
    const accessUntil = signedInUser.accessUntil;
    const active =
      accessUntil != null &&
      !Number.isNaN(Date.parse(accessUntil)) &&
      Date.parse(accessUntil) > Date.now();
    setUser(signedInUser);
    setAccess({ active, accessUntil });
    setStatus('ready');
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    setAccess(defaultAccess);
    setStatus('ready');
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await fetchPlayerMe();
        if (!cancelled) applyMe(me);
      } catch {
        if (!cancelled) {
          setUser(null);
          setAccess(defaultAccess);
          setStatus('ready');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyMe]);

  const value = useMemo(
    () => ({
      status,
      user,
      access,
      refresh,
      setSignedIn,
      clearAuth,
    }),
    [status, user, access, refresh, setSignedIn, clearAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
