import { createContext } from 'react';
import type { MeAccess, PublicUser } from '../lib/playerAuthApi';

export type AuthStatus = 'loading' | 'ready';

export interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  access: MeAccess;
  refresh: () => Promise<void>;
  setSignedIn: (user: PublicUser) => void;
  clearAuth: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
