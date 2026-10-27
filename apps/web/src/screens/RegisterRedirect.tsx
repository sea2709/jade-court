/**
 * Legacy `/register` → `/login?mode=register` while preserving query params.
 */
import { Navigate, useLocation } from 'react-router-dom';
import { AUTH_REGISTER_MODE } from '../lib/authScreenMode';

/** Redirect old register URLs to combined auth screen in register mode. */
export function RegisterRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('mode', AUTH_REGISTER_MODE);
  const serialized = params.toString();
  return <Navigate to={`/login${serialized ? `?${serialized}` : ''}`} replace />;
}
