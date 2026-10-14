import { describe, expect, it } from 'vitest';
import { isHttpOrHttpsUrl, normalizeNewsUrl } from './normalizeUrl.js';

describe('normalizeNewsUrl', () => {
  it('lowercases the host', () => {
    const r = normalizeNewsUrl('https://Example.COM/path');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe('https://example.com/path');
  });

  it('strips utm_* and fbclid query params', () => {
    const r = normalizeNewsUrl(
      'https://news.example.com/a?utm_source=x&utm_medium=y&fbclid=abc&keep=1',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized).toBe('https://news.example.com/a?keep=1');
    }
  });

  it('removes the fragment', () => {
    const r = normalizeNewsUrl('https://news.example.com/a#section');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe('https://news.example.com/a');
  });

  it('drops default ports', () => {
    expect(
      normalizeNewsUrl('http://ex.com:80/x').ok && normalizeNewsUrl('http://ex.com:80/x'),
    ).toMatchObject({
      ok: true,
    });
    const http = normalizeNewsUrl('http://ex.com:80/x');
    if (http.ok) expect(http.normalized).toBe('http://ex.com/x');
    const https = normalizeNewsUrl('https://ex.com:443/x');
    if (https.ok) expect(https.normalized).toBe('https://ex.com/x');
  });

  it('strips trailing slash on non-root paths', () => {
    const r = normalizeNewsUrl('https://ex.com/foo/');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe('https://ex.com/foo');
  });

  it('normalizes root without trailing slash', () => {
    const r = normalizeNewsUrl('https://ex.com/');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toBe('https://ex.com');
  });

  it('rejects non-http(s) schemes', () => {
    expect(normalizeNewsUrl('javascript:alert(1)').ok).toBe(false);
    expect(normalizeNewsUrl('ftp://ex.com').ok).toBe(false);
  });

  it('returns sourceDomain from hostname', () => {
    const r = normalizeNewsUrl('https://xiangqi.com/news');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sourceDomain).toBe('xiangqi.com');
  });
});

describe('isHttpOrHttpsUrl', () => {
  it('accepts http and https', () => {
    expect(isHttpOrHttpsUrl('http://a.com')).toBe(true);
    expect(isHttpOrHttpsUrl('https://a.com')).toBe(true);
    expect(isHttpOrHttpsUrl('javascript:void')).toBe(false);
  });
});
