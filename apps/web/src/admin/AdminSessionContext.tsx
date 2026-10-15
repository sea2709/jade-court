/**
 * React context for the authenticated admin session inside `AdminLayout`.
 */
import { createContext, useContext } from 'react';

export type AdminSessionContextValue = {
  username: string;
  onUnauthorized: () => void;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

/** Admin session context for nested section screens. */
export function useAdminSession(): AdminSessionContextValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error('useAdminSession must be used within AdminLayout');
  }
  return ctx;
}

export { AdminSessionContext };
