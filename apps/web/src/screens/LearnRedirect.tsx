import { Navigate } from 'react-router-dom';

/** Legacy `/learn` → `/play-ai`. */
export function LearnRedirect() {
  return <Navigate to="/play-ai" replace />;
}
