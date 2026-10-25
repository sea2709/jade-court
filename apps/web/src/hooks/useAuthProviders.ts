/**
 * Load configured OAuth providers once for login/register chrome.
 */
import { useEffect, useState } from 'react';
import { fetchAuthProviders } from '../lib/oauthAuthApi';

export function useAuthProviders(): { providers: string[]; loading: boolean } {
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchAuthProviders();
        if (!cancelled) setProviders(list);
      } catch {
        if (!cancelled) setProviders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { providers, loading };
}
