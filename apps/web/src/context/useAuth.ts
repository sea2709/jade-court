import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './authContext';

/** Access player auth state; must be used under `AuthProvider`. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
