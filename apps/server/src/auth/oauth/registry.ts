/**
 * OAuth provider registry (Google, Facebook, optional test fake).
 */
import { createFakeOAuthProvider } from './fake.js';
import { createFacebookOAuthProvider, type FacebookOAuthDeps } from './facebook.js';
import { createGoogleOAuthProvider, type GoogleOAuthDeps } from './google.js';
import type { OAuthProvider } from './types.js';
import { isFakeOAuthEnabled } from './config.js';

export type OAuthRegistryDeps = GoogleOAuthDeps & FacebookOAuthDeps;

let registryOverride: Map<string, OAuthProvider> | null = null;

/** Replace providers in Vitest. */
export function setOAuthProvidersForTests(providers: Map<string, OAuthProvider> | null): void {
  registryOverride = providers;
}

function buildDefaultRegistry(deps: OAuthRegistryDeps = {}): Map<string, OAuthProvider> {
  const map = new Map<string, OAuthProvider>();
  map.set('google', createGoogleOAuthProvider(deps));
  map.set('facebook', createFacebookOAuthProvider(deps));
  if (isFakeOAuthEnabled()) {
    map.set('fake', createFakeOAuthProvider());
  }
  return map;
}

export function getOAuthProvider(id: string, deps: OAuthRegistryDeps = {}): OAuthProvider | null {
  const registry = registryOverride ?? buildDefaultRegistry(deps);
  return registry.get(id) ?? null;
}

export function listConfiguredOAuthProviders(deps: OAuthRegistryDeps = {}): string[] {
  const registry = registryOverride ?? buildDefaultRegistry(deps);
  const ids: string[] = [];
  for (const [id, provider] of registry) {
    if (provider.isConfigured()) ids.push(id);
  }
  ids.sort();
  return ids;
}

export function isKnownOAuthProvider(id: string, deps: OAuthRegistryDeps = {}): boolean {
  const registry = registryOverride ?? buildDefaultRegistry(deps);
  return registry.has(id);
}
