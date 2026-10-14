import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LookupOptions } from 'node:dns';
import type * as Undici from 'undici';
import {
  BlockedUrlError,
  createPinnedConnectLookup,
  fetchPageMetadata,
  isBlockedIpAddress,
  MetadataFetchFailedError,
  parsePageMetadata,
  resetDnsResolverForTests,
  resetMetadataTimeoutForTests,
  setDnsResolverForTests,
  setMetadataTimeoutForTests,
} from './metadata.js';

const undiciFetch = vi.hoisted(() => vi.fn());

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof Undici>();
  return {
    ...actual,
    fetch: undiciFetch,
  };
});

const FIXTURE_HTML = `<!DOCTYPE html><html><head>
<meta property="og:title" content="OG Title" />
<meta name="twitter:title" content="Twitter Title" />
<meta property="og:description" content="OG Desc" />
<meta property="og:image" content="/img/cover.jpg" />
<meta property="og:site_name" content="Xiangqi Daily" />
<meta property="article:published_time" content="2024-05-01T12:00:00Z" />
<link rel="canonical" href="https://canonical.example.com/page" />
<title>HTML Title</title>
</head><body></body></html>`;

function lookupAsync(
  lookup: ReturnType<typeof createPinnedConnectLookup>['lookup'],
  host: string,
  family: number,
): Promise<{ address: string; family: number }> {
  return new Promise((resolve, reject) => {
    lookup(host, { family } as LookupOptions, (err, address, fam) => {
      if (err) reject(err);
      else resolve({ address, family: fam });
    });
  });
}

describe('parsePageMetadata', () => {
  it('prefers OG tags and resolves relative images', () => {
    const base = new URL('https://site.example.com/article');
    const meta = parsePageMetadata(FIXTURE_HTML, base);
    expect(meta.title).toBe('OG Title');
    expect(meta.description).toBe('OG Desc');
    expect(meta.imageUrl).toBe('https://site.example.com/img/cover.jpg');
    expect(meta.publisher).toBe('Xiangqi Daily');
    expect(meta.publishedAt).toBe('2024-05-01T12:00:00Z');
    expect(meta.canonicalUrl).toBe('https://canonical.example.com/page');
  });

  it('falls back to twitter and title when OG missing', () => {
    const html = `<html><head>
<meta name="twitter:title" content="T Title" />
<meta name="description" content="Plain desc" />
</head></html>`;
    const meta = parsePageMetadata(html, new URL('https://ex.com'));
    expect(meta.title).toBe('T Title');
    expect(meta.description).toBe('Plain desc');
  });
});

describe('isBlockedIpAddress', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.0.0.1', true],
    ['172.16.0.1', true],
    ['192.168.1.1', true],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['100.127.255.255', true],
    ['0.1.2.3', true],
    ['198.18.0.1', true],
    ['198.19.255.255', true],
    ['224.0.0.1', true],
    ['240.0.0.1', true],
    ['::1', true],
    ['::', true],
    ['::ffff:127.0.0.1', true],
    ['fe80::1', true],
    ['fe90::1', true],
    ['febf::1', true],
    ['fc00::1', true],
    ['fd12::1', true],
    ['64:ff9b::192.0.2.1', true],
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['2001:4860:4860::8888', false],
  ])('blocks or allows %s → %s', (ip, blocked) => {
    expect(isBlockedIpAddress(ip)).toBe(blocked);
  });
});

describe('createPinnedConnectLookup', () => {
  const mockDns = {
    resolve4: vi.fn(async () => ['8.8.8.8']),
    resolve6: vi.fn(async () => [] as string[]),
  };

  beforeEach(() => {
    setDnsResolverForTests(mockDns as never);
    mockDns.resolve4.mockReset();
    mockDns.resolve6.mockReset();
  });

  afterEach(() => {
    resetDnsResolverForTests();
  });

  it('pins the first validated DNS answer and ignores rebinding on later lookups', async () => {
    let resolve4Calls = 0;
    mockDns.resolve4.mockImplementation(async () => {
      resolve4Calls += 1;
      return resolve4Calls === 1 ? ['8.8.8.8'] : ['10.0.0.5'];
    });

    const { lookup } = createPinnedConnectLookup('rebind.example.com');
    const first = await lookupAsync(lookup, 'rebind.example.com', 4);
    const second = await lookupAsync(lookup, 'rebind.example.com', 4);

    expect(first.address).toBe('8.8.8.8');
    expect(second.address).toBe('8.8.8.8');
    expect(resolve4Calls).toBe(1);
  });

  it('returns all pinned v4 addresses when options.all is true', async () => {
    mockDns.resolve4.mockResolvedValue(['1.2.3.4', '5.6.7.8']);
    const { lookup } = createPinnedConnectLookup('multi.example.com');
    const all = await new Promise<LookupAddress[]>((resolve, reject) => {
      lookup('multi.example.com', { all: true, family: 4 } as LookupOptions, (err, addresses) => {
        if (err) reject(err);
        else resolve(addresses as LookupAddress[]);
      });
    });
    expect(all).toEqual([
      { address: '1.2.3.4', family: 4 },
      { address: '5.6.7.8', family: 4 },
    ]);
  });
});

type LookupAddress = { address: string; family: number };

describe('fetchPageMetadata SSRF guard', () => {
  const mockDns = {
    resolve4: vi.fn(async () => ['8.8.8.8']),
    resolve6: vi.fn(async () => [] as string[]),
  };

  beforeEach(() => {
    undiciFetch.mockReset();
    setDnsResolverForTests(mockDns as never);
    mockDns.resolve4.mockReset();
    mockDns.resolve6.mockReset();
    resetMetadataTimeoutForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetDnsResolverForTests();
    resetMetadataTimeoutForTests();
  });

  it('rejects localhost via DNS block', async () => {
    mockDns.resolve4.mockResolvedValue(['127.0.0.1']);
    await expect(fetchPageMetadata('http://localhost/page')).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
  });

  it('rejects metadata IP 169.254.169.254', async () => {
    mockDns.resolve4.mockResolvedValue(['169.254.169.254']);
    await expect(fetchPageMetadata('http://example.com/')).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it('rejects non-80/443 ports', async () => {
    await expect(fetchPageMetadata('http://example.com:8080/')).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
  });

  it('rejects redirect to private address', async () => {
    mockDns.resolve4.mockResolvedValueOnce(['8.8.8.8']).mockResolvedValueOnce(['10.0.0.5']);
    undiciFetch.mockResolvedValueOnce(Response.redirect('http://internal.local/', 302));
    await expect(fetchPageMetadata('https://public.example.com/')).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
  });

  it('returns parsed metadata on success', async () => {
    mockDns.resolve4.mockResolvedValue(['8.8.4.4']);
    undiciFetch.mockResolvedValue(
      new Response(FIXTURE_HTML, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
    const meta = await fetchPageMetadata('https://news.example.com/story');
    expect(meta.title).toBe('OG Title');
  });

  it('fails on non-html content type', async () => {
    mockDns.resolve4.mockResolvedValue(['8.8.4.4']);
    undiciFetch.mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await expect(fetchPageMetadata('https://news.example.com/data')).rejects.toBeInstanceOf(
      MetadataFetchFailedError,
    );
  });

  it('fails when body exceeds cap', async () => {
    mockDns.resolve4.mockResolvedValue(['8.8.4.4']);
    const big = 'x'.repeat(1_048_577);
    undiciFetch.mockResolvedValue(
      new Response(big, { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await expect(fetchPageMetadata('https://news.example.com/big')).rejects.toBeInstanceOf(
      MetadataFetchFailedError,
    );
  });

  it('fails when fetch aborts (timeout path)', async () => {
    mockDns.resolve4.mockResolvedValue(['8.8.4.4']);
    undiciFetch.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'));
    await expect(fetchPageMetadata('https://slow.example.com/')).rejects.toBeInstanceOf(
      MetadataFetchFailedError,
    );
  });

  it('aborts a slow body read within the overall metadata deadline', async () => {
    vi.useFakeTimers();
    setMetadataTimeoutForTests(200);
    mockDns.resolve4.mockResolvedValue(['8.8.4.4']);

    const hangingBody = new ReadableStream<Uint8Array>({
      pull() {
        /* never completes — simulates slowloris after headers */
      },
    });
    undiciFetch.mockResolvedValue(
      new Response(hangingBody, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const result = fetchPageMetadata('https://drip.example.com/');
    const expectation = expect(result).rejects.toBeInstanceOf(MetadataFetchFailedError);
    await vi.advanceTimersByTimeAsync(250);
    await expectation;
  });
});
