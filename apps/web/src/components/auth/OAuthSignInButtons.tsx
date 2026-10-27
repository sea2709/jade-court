/**
 * Stacked Google + Facebook sign-in links for login and register.
 */
import { FacebookSignInButton } from './FacebookSignInButton';
import { GoogleSignInButton } from './GoogleSignInButton';

export type OAuthSignInButtonsProps = {
  googleProvider: string | null;
  facebookProvider: string | null;
  returnTo: string;
  dividerLabel: string;
};

/** Renders configured OAuth providers and an “or …” divider before email fields. */
export function OAuthSignInButtons({
  googleProvider,
  facebookProvider,
  returnTo,
  dividerLabel,
}: OAuthSignInButtonsProps) {
  if (!googleProvider && !facebookProvider) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3.5">
      {googleProvider ? <GoogleSignInButton provider={googleProvider} returnTo={returnTo} /> : null}
      {facebookProvider ? (
        <FacebookSignInButton provider={facebookProvider} returnTo={returnTo} />
      ) : null}
      <p className="auth-divider">{dividerLabel}</p>
    </div>
  );
}
