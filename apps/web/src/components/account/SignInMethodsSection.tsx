/**
 * Account settings: password + Google link state and actions.
 */
import { useEffect, useState } from 'react';
import {
  fetchAuthIdentities,
  fetchAuthProviders,
  googleAccountProviderId,
  linkOAuthProvider,
  oauthErrorMessage,
  unlinkOAuthProvider,
} from '../../lib/oauthAuthApi';
import { PlayerAuthApiError } from '../../lib/playerAuthApi';
import { useAuth } from '../../context/useAuth';

function unlinkErrorMessage(err: unknown): string {
  if (err instanceof PlayerAuthApiError && err.code === 'last_sign_in_method') {
    return 'Add a password or another sign-in method before unlinking Google.';
  }
  if (err instanceof PlayerAuthApiError && err.code === 'not_linked') {
    return 'Google is not linked to this account.';
  }
  return 'Could not update Google link. Try again.';
}

export type SignInMethodsSectionProps = {
  oauthErrorCode?: string | null;
};

/** Lists sign-in methods and supports Google link / unlink. */
export function SignInMethodsSection({ oauthErrorCode }: SignInMethodsSectionProps) {
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const googleProvider = googleAccountProviderId(configuredProviders);
  const googleLinked = googleProvider ? linkedProviders.includes(googleProvider) : false;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [configured, identities] = await Promise.all([
          fetchAuthProviders(),
          fetchAuthIdentities(),
        ]);
        if (cancelled) return;
        setConfiguredProviders(configured);
        setHasPassword(identities.hasPassword);
        setLinkedProviders(identities.providers);
      } catch {
        if (!cancelled) {
          setConfiguredProviders([]);
          setHasPassword(false);
          setLinkedProviders([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onLink = async () => {
    if (!googleProvider || linking) return;
    setLinking(true);
    setActionError(null);
    try {
      await linkOAuthProvider(googleProvider, '/account');
    } catch (err) {
      setActionError(unlinkErrorMessage(err));
      setLinking(false);
    }
  };

  const onUnlink = async () => {
    if (!googleProvider || unlinking) return;
    const ok = window.confirm('Unlink Google from this account? You can link it again later.');
    if (!ok) return;
    setUnlinking(true);
    setActionError(null);
    try {
      await unlinkOAuthProvider(googleProvider);
      const [configured, identities] = await Promise.all([
        fetchAuthProviders(),
        fetchAuthIdentities(),
      ]);
      setConfiguredProviders(configured);
      setHasPassword(identities.hasPassword);
      setLinkedProviders(identities.providers);
      await refresh();
    } catch (err) {
      setActionError(unlinkErrorMessage(err));
    } finally {
      setUnlinking(false);
    }
  };

  const bannerError = actionError ?? oauthErrorMessage(oauthErrorCode ?? null);

  return (
    <section
      className="mt-8 border-t border-line-soft pt-8"
      aria-labelledby="sign-in-methods-heading"
    >
      <h2 id="sign-in-methods-heading" className="m-0 mb-1 text-base font-extrabold text-ink">
        Sign-in methods
      </h2>
      <p className="m-0 mb-4 text-sm font-semibold text-muted">
        Ways you can sign in to Jade Court.
      </p>
      {loading ? (
        <p className="text-sm font-semibold text-muted">Loading sign-in methods…</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-line-soft bg-cream/50 px-4 py-3">
            <span className="text-sm font-bold text-ink">Password</span>
            <span className="text-sm font-semibold text-muted">
              {hasPassword ? 'Enabled' : 'Not set'}
            </span>
          </li>
          {googleProvider ? (
            <li className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-line-soft bg-cream/50 px-4 py-3">
              <span className="text-sm font-bold text-ink">Google</span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-muted">
                  {googleLinked ? 'Linked' : 'Not linked'}
                </span>
                {googleLinked ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm border border-line-soft"
                    disabled={unlinking}
                    onClick={() => void onUnlink()}
                  >
                    {unlinking ? 'Unlinking…' : 'Unlink'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm border border-line-soft"
                    disabled={linking}
                    onClick={() => void onLink()}
                  >
                    {linking ? 'Linking…' : 'Link Google'}
                  </button>
                )}
              </div>
            </li>
          ) : null}
        </ul>
      )}
      {bannerError ? (
        <p className="mt-4 text-sm font-bold text-red-deep" role="alert">
          {bannerError}
        </p>
      ) : null}
    </section>
  );
}
