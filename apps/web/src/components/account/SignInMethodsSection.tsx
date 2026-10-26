/**
 * Account settings: password + Google/Facebook link state and actions.
 */
import { useEffect, useState } from 'react';
import {
  facebookAccountProviderId,
  fetchAuthIdentities,
  fetchAuthProviders,
  googleAccountProviderId,
  linkOAuthProvider,
  oauthErrorMessage,
  unlinkOAuthProvider,
} from '../../lib/oauthAuthApi';
import { PlayerAuthApiError } from '../../lib/playerAuthApi';
import { useAuth } from '../../context/useAuth';

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  facebook: 'Facebook',
  fake: 'Test sign-in',
};

function providerLabel(providerId: string): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}

function unlinkErrorMessage(err: unknown, providerId: string): string {
  const label = providerLabel(providerId);
  if (err instanceof PlayerAuthApiError && err.code === 'last_sign_in_method') {
    return `Add a password or another sign-in method before unlinking ${label}.`;
  }
  if (err instanceof PlayerAuthApiError && err.code === 'not_linked') {
    return `${label} is not linked to this account.`;
  }
  return `Could not update ${label} link. Try again.`;
}

export type SignInMethodsSectionProps = {
  oauthErrorCode?: string | null;
};

type OAuthProviderRowProps = {
  providerId: string;
  linked: boolean;
  linking: boolean;
  unlinking: boolean;
  onLink: () => void;
  onUnlink: () => void;
};

function OAuthProviderRow({
  providerId,
  linked,
  linking,
  unlinking,
  onLink,
  onUnlink,
}: OAuthProviderRowProps) {
  const label = providerLabel(providerId);
  const linkLabel = providerId === 'google' ? 'Link Google' : `Link ${label}`;
  const confirmMessage =
    providerId === 'google'
      ? 'Unlink Google from this account? You can link it again later.'
      : `Unlink ${label} from this account? You can link it again later.`;

  const onUnlinkClick = () => {
    const ok = window.confirm(confirmMessage);
    if (ok) onUnlink();
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-line-soft bg-cream/50 px-4 py-3">
      <span className="text-sm font-bold text-ink">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-muted">{linked ? 'Linked' : 'Not linked'}</span>
        {linked ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm border border-line-soft"
            disabled={unlinking}
            onClick={onUnlinkClick}
          >
            {unlinking ? 'Unlinking…' : 'Unlink'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm border border-line-soft"
            disabled={linking}
            onClick={onLink}
          >
            {linking ? 'Linking…' : linkLabel}
          </button>
        )}
      </div>
    </li>
  );
}

/** Lists sign-in methods and supports OAuth link / unlink. */
export function SignInMethodsSection({ oauthErrorCode }: SignInMethodsSectionProps) {
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [linkedProviders, setLinkedProviders] = useState<string[]>([]);
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);

  const googleProvider = googleAccountProviderId(configuredProviders);
  const facebookProvider = facebookAccountProviderId(configuredProviders);
  const oauthRows = [
    ...new Set([googleProvider, facebookProvider].filter((p): p is string => p != null)),
  ];

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

  const reloadIdentities = async () => {
    const [configured, identities] = await Promise.all([
      fetchAuthProviders(),
      fetchAuthIdentities(),
    ]);
    setConfiguredProviders(configured);
    setHasPassword(identities.hasPassword);
    setLinkedProviders(identities.providers);
    await refresh();
  };

  const onLink = async (providerId: string) => {
    if (linkingProvider) return;
    setLinkingProvider(providerId);
    setActionError(null);
    try {
      await linkOAuthProvider(providerId, '/account');
    } catch (err) {
      setActionError(unlinkErrorMessage(err, providerId));
      setLinkingProvider(null);
    }
  };

  const onUnlink = async (providerId: string) => {
    if (unlinkingProvider) return;
    setUnlinkingProvider(providerId);
    setActionError(null);
    try {
      await unlinkOAuthProvider(providerId);
      await reloadIdentities();
    } catch (err) {
      setActionError(unlinkErrorMessage(err, providerId));
    } finally {
      setUnlinkingProvider(null);
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
          {oauthRows.map((providerId) => (
            <OAuthProviderRow
              key={providerId}
              providerId={providerId}
              linked={linkedProviders.includes(providerId)}
              linking={linkingProvider === providerId}
              unlinking={unlinkingProvider === providerId}
              onLink={() => void onLink(providerId)}
              onUnlink={() => void onUnlink(providerId)}
            />
          ))}
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
