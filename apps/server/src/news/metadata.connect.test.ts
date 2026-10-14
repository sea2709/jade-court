/**
 * Integration tests for pinned Undici connect (real TCP, no mocked fetch).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { fetch as undiciFetch } from 'undici';
import { createPinnedMetadataAgent, parsePageMetadata } from './metadata.js';

const FIXTURE_HTML = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Pinned Connect Title" />
<meta property="og:description" content="Description from local server" />
</head><body></body></html>`;

function listen(server: Server, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('expected bound port'));
        return;
      }
      resolve((addr as AddressInfo).port);
    });
  });
}

describe('createPinnedMetadataAgent (real connect)', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
      server = undefined;
    }
  });

  it('fetches HTML via pinned IP with correct Host header', async () => {
    let seenHost = '';
    server = createServer((req, res) => {
      seenHost = req.headers.host ?? '';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(FIXTURE_HTML);
    });
    const port = await listen(server, '127.0.0.1');
    const hostname = 'news.test';
    const dispatcher = createPinnedMetadataAgent(hostname, { v4: ['127.0.0.1'], v6: [] });

    try {
      const res = await undiciFetch(`http://${hostname}:${port}/`, {
        dispatcher,
        headers: { Host: `${hostname}:${port}` },
      });
      expect(res.status).toBe(200);
      const html = await res.text();
      const meta = parsePageMetadata(html, new URL(`http://${hostname}:${port}/`));
      expect(meta.title).toBe('Pinned Connect Title');
      expect(meta.description).toBe('Description from local server');
      expect(seenHost).toBe(`${hostname}:${port}`);
    } finally {
      await dispatcher.close();
    }
  });
});
