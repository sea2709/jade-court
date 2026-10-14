/**
 * SSRF-guarded Open Graph / Twitter metadata fetch for admin news preview.
 * Connects via Undici with DNS pinning so pre-check and socket use the same addresses.
 */
import { isIPv4, isIPv6 } from 'node:net';
import { parse as parseHtml } from 'node-html-parser';
import * as dns from 'node:dns/promises';
import type { LookupOptions } from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { normalizeNewsUrl } from './normalizeUrl.js';

export const METADATA_USER_AGENT = 'JadeCourtNewsBot/1.0';
export const METADATA_TIMEOUT_MS = 5_000;
export const METADATA_MAX_BYTES = 1_048_576;
export const METADATA_MAX_REDIRECTS = 3;

export type MetadataFetchError = 'invalid_url' | 'blocked_url' | 'fetch_failed';

export interface PageMetadata {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  publisher: string | null;
  publishedAt: string | null;
  canonicalUrl: string | null;
}

type DnsModule = typeof dns;

let dnsImpl: DnsModule = dns;
let metadataTimeoutMs = METADATA_TIMEOUT_MS;

/** Test hook to stub DNS resolution. */
export function setDnsResolverForTests(resolver: DnsModule): void {
  dnsImpl = resolver;
}

export function resetDnsResolverForTests(): void {
  dnsImpl = dns;
}

/** Test hook for shorter metadata deadlines. */
export function setMetadataTimeoutForTests(ms: number): void {
  metadataTimeoutMs = ms;
}

export function resetMetadataTimeoutForTests(): void {
  metadataTimeoutMs = METADATA_TIMEOUT_MS;
}

function isBlockedPort(port: string): boolean {
  if (!port) return false;
  const n = Number(port);
  return n !== 80 && n !== 443;
}

function blockedIpv4(a: number, b: number, _c: number, _d: number): boolean {
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true; // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark 198.18.0.0/15
  if (a >= 224) return true; // multicast + reserved 224.0.0.0/3
  return false;
}

function blockedIpv6(normalized: string): boolean {
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('::ffff:')) {
    const v4 = normalized.slice('::ffff:'.length);
    if (isIPv4(v4)) {
      const parts = v4.split('.').map(Number);
      return blockedIpv4(parts[0]!, parts[1]!, parts[2]!, parts[3]!);
    }
  }
  // NAT64 well-known prefix 64:ff9b::/96
  if (normalized.startsWith('64:ff9b:')) return true;
  // Unique local fc00::/7
  const lower = normalized.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // Link-local fe80::/10
  if (/^fe[89ab][0-9a-f]/i.test(lower)) return true;
  return false;
}

/** Reject loopback, private, link-local, CGNAT, and other non-global addresses. */
export function isBlockedIpAddress(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
    return blockedIpv4(parts[0]!, parts[1]!, parts[2]!, parts[3]!);
  }
  if (isIPv6(normalized)) {
    return blockedIpv6(normalized);
  }
  return false;
}

async function resolveValidatedAddresses(
  hostname: string,
): Promise<{ v4: string[]; v6: string[] }> {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new BlockedUrlError();
  }

  let v4: string[];
  let v6: string[];
  try {
    v4 = await dnsImpl.resolve4(host).catch(() => [] as string[]);
    v6 = await dnsImpl.resolve6(host).catch(() => [] as string[]);
    if (v4.length === 0 && v6.length === 0) throw new BlockedUrlError();
  } catch (err) {
    if (err instanceof BlockedUrlError) throw err;
    throw new BlockedUrlError();
  }

  for (const ip of [...v4, ...v6]) {
    if (isBlockedIpAddress(ip)) throw new BlockedUrlError();
  }

  return { v4, v6 };
}

type DnsLookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

interface LookupAddress {
  address: string;
  family: number;
}

function normalizeLookupFamily(family: LookupOptions['family']): number {
  if (family === 'IPv4') return 4;
  if (family === 'IPv6') return 6;
  return typeof family === 'number' ? family : 0;
}

function pinnedEntries(
  addrs: { v4: string[]; v6: string[] },
  familyFilter: number,
): LookupAddress[] {
  const entries: LookupAddress[] = [];
  if (familyFilter === 4 || familyFilter === 0) {
    for (const address of addrs.v4) entries.push({ address, family: 4 });
  }
  if (familyFilter === 6 || familyFilter === 0) {
    for (const address of addrs.v6) entries.push({ address, family: 6 });
  }
  return entries;
}

/** Build a pinned `lookup` used by Undici connect (validates once, caches for rebinding defense). */
export function createPinnedConnectLookup(
  hostname: string,
  preResolved?: { v4: string[]; v6: string[] },
): {
  lookup: (host: string, options: LookupOptions, callback: DnsLookupCallback) => void;
} {
  let pinned: { v4: string[]; v6: string[] } | null = preResolved ?? null;
  let pending: Promise<{ v4: string[]; v6: string[] }> | null = null;

  function ensurePinned(): Promise<{ v4: string[]; v6: string[] }> {
    if (pinned) return Promise.resolve(pinned);
    if (!pending) {
      pending = resolveValidatedAddresses(hostname).then((result) => {
        pinned = result;
        return result;
      });
    }
    return pending;
  }

  const lookup = (host: string, options: LookupOptions, callback: DnsLookupCallback) => {
    const fail = (err: NodeJS.ErrnoException) => callback(err, '', 0);

    if (host !== hostname) {
      fail(Object.assign(new Error('hostname mismatch'), { code: 'EINVAL' }));
      return;
    }
    void ensurePinned()
      .then((addrs) => {
        const familyFilter = normalizeLookupFamily(options?.family);
        const entries = pinnedEntries(addrs, familyFilter);
        if (entries.length === 0) {
          fail(Object.assign(new Error('no address'), { code: 'ENOTFOUND' }));
          return;
        }
        if (options?.all) {
          callback(null, entries);
          return;
        }
        const first = entries[0]!;
        callback(null, first.address, first.family);
      })
      .catch((err) => {
        fail(err instanceof BlockedUrlError ? err : new BlockedUrlError());
      });
  };

  return { lookup };
}

/** Undici agent that connects only to addresses validated at first resolution. */
export function createPinnedMetadataAgent(
  hostname: string,
  preResolved?: { v4: string[]; v6: string[] },
): Agent {
  const { lookup } = createPinnedConnectLookup(hostname, preResolved);
  return new Agent({
    connect: {
      servername: hostname,
      lookup,
    },
  });
}

export class BlockedUrlError extends Error {
  readonly code = 'blocked_url' as const;
  constructor() {
    super('blocked_url');
  }
}

export class InvalidMetadataUrlError extends Error {
  readonly code = 'invalid_url' as const;
  constructor() {
    super('invalid_url');
  }
}

export class MetadataFetchFailedError extends Error {
  readonly code = 'fetch_failed' as const;
  constructor() {
    super('fetch_failed');
  }
}

function metaContent(root: ReturnType<typeof parseHtml>, selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (!el) continue;
    const content = el.getAttribute('content') ?? el.getAttribute('value');
    if (content?.trim()) return content.trim();
    if (sel === 'title' && el.text?.trim()) return el.text.trim();
  }
  return null;
}

function linkHref(root: ReturnType<typeof parseHtml>, rel: string): string | null {
  const el = root.querySelector(`link[rel="${rel}"]`);
  const href = el?.getAttribute('href');
  return href?.trim() ? href.trim() : null;
}

function resolveMaybeRelative(base: URL, value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

/** Parse HTML head metadata (OG → Twitter → fallbacks). */
export function parsePageMetadata(html: string, pageUrl: URL): PageMetadata {
  const root = parseHtml(html);
  const head = root.querySelector('head') ?? root;

  const title =
    metaContent(head, ['meta[property="og:title"]', 'meta[name="twitter:title"]', 'title']) ?? null;

  const description =
    metaContent(head, [
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ]) ?? null;

  const imageRaw =
    metaContent(head, ['meta[property="og:image"]', 'meta[name="twitter:image"]']) ?? null;
  const imageUrl = resolveMaybeRelative(pageUrl, imageRaw);

  const publisher =
    metaContent(head, ['meta[property="og:site_name"]']) ?? pageUrl.hostname ?? null;

  const publishedAt = metaContent(head, ['meta[property="article:published_time"]']) ?? null;

  const canonicalUrl =
    resolveMaybeRelative(
      pageUrl,
      metaContent(head, ['meta[property="og:url"]']) ?? linkHref(head, 'canonical'),
    ) ?? pageUrl.toString();

  return { title, description, imageUrl, publisher, publishedAt, canonicalUrl };
}

async function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new MetadataFetchFailedError();
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new MetadataFetchFailedError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

async function readHtmlWithCap(res: Response, signal: AbortSignal): Promise<string> {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().includes('text/html')) {
    throw new MetadataFetchFailedError();
  }

  if (!res.body) throw new MetadataFetchFailedError();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    if (signal.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new MetadataFetchFailedError();
    }
    const { done, value } = await awaitWithAbort(reader.read(), signal);
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > METADATA_MAX_BYTES) {
      await reader.cancel();
      throw new MetadataFetchFailedError();
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  if (signal.aborted) throw new MetadataFetchFailedError();
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

/**
 * Fetch and parse Open Graph metadata for a public http(s) URL.
 * Manual redirect handling with SSRF checks and pinned connect on each hop.
 */
export async function fetchPageMetadata(inputUrl: string): Promise<PageMetadata> {
  let current: URL;
  try {
    current = new URL(inputUrl.trim());
  } catch {
    throw new InvalidMetadataUrlError();
  }

  if (current.protocol !== 'http:' && current.protocol !== 'https:') {
    throw new InvalidMetadataUrlError();
  }
  if (isBlockedPort(current.port)) {
    throw new BlockedUrlError();
  }

  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(), metadataTimeoutMs);

  try {
    let redirects = 0;
    while (true) {
      const pinnedAddresses = await resolveValidatedAddresses(current.hostname);
      const dispatcher = createPinnedMetadataAgent(current.hostname, pinnedAddresses);
      let res: Response;
      try {
        res = await undiciFetch(current.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: deadline.signal,
          dispatcher,
          headers: {
            'User-Agent': METADATA_USER_AGENT,
            Accept: 'text/html',
            Host: current.host,
          },
        });
      } catch (err) {
        if (
          err instanceof BlockedUrlError ||
          err instanceof InvalidMetadataUrlError ||
          err instanceof MetadataFetchFailedError
        ) {
          throw err;
        }
        throw new MetadataFetchFailedError();
      } finally {
        await dispatcher.close();
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new MetadataFetchFailedError();
        redirects += 1;
        if (redirects > METADATA_MAX_REDIRECTS) throw new BlockedUrlError();
        try {
          current = new URL(location, current);
        } catch {
          throw new MetadataFetchFailedError();
        }
        if (current.protocol !== 'http:' && current.protocol !== 'https:') {
          throw new InvalidMetadataUrlError();
        }
        if (isBlockedPort(current.port)) throw new BlockedUrlError();
        continue;
      }

      if (!res.ok) throw new MetadataFetchFailedError();

      const html = await readHtmlWithCap(res, deadline.signal);
      return parsePageMetadata(html, current);
    }
  } finally {
    clearTimeout(deadlineTimer);
  }
}

/** Normalize URL for duplicate check after preview (canonical preferred). */
export function normalizedUrlForPreview(
  canonicalUrl: string | null,
  inputUrl: string,
): string | null {
  const target = canonicalUrl ?? inputUrl;
  const norm = normalizeNewsUrl(target);
  return norm.ok ? norm.normalized : null;
}
