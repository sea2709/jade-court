import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DiskNewsImageStorage,
  MemoryNewsImageStorage,
  NEWS_IMAGE_MAX_BYTES,
  sniffImageType,
  uploadedImageFilename,
  UPLOADED_IMAGE_FILENAME_RE,
} from './imageStorage.js';

/** Minimal valid 1×1 PNG (67 bytes). */
const TINY_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

describe('sniffImageType', () => {
  it('detects PNG, JPEG, and rejects GIF/SVG/text', () => {
    expect(sniffImageType(TINY_PNG)).toBe('png');
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe('jpg');
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImageType(webp)).toBe('webp');
    expect(sniffImageType(Uint8Array.from([0x47, 0x49, 0x46, 0x38]))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('<svg></svg>'))).toBeNull();
  });
});

describe('uploadedImageFilename', () => {
  it('parses valid paths and rejects others', () => {
    const path = '/api/news/images/550e8400-e29b-41d4-a716-446655440000.png';
    expect(uploadedImageFilename(path)).toBe('550e8400-e29b-41d4-a716-446655440000.png');
    expect(uploadedImageFilename('https://cdn.example.com/x.png')).toBeNull();
    expect(uploadedImageFilename('/api/news/images/../evil.png')).toBeNull();
  });
});

describe('MemoryNewsImageStorage', () => {
  it('saves, reads, and removes', async () => {
    const store = new MemoryNewsImageStorage();
    const file = await store.save(TINY_PNG, 'png');
    expect(UPLOADED_IMAGE_FILENAME_RE.test(file)).toBe(true);
    const read = await store.read(file);
    expect(read?.contentType).toBe('image/png');
    await store.remove(file);
    expect(store.has(file)).toBe(false);
  });

  it('rejects traversal filenames on read/remove', async () => {
    const store = new MemoryNewsImageStorage();
    await expect(store.read('../secret.png')).rejects.toThrow();
    await expect(store.remove('..%2Fsecret.png')).rejects.toThrow();
  });
});

describe('DiskNewsImageStorage', () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('writes under a temp dir and removes files', async () => {
    dir = await mkdtemp(join(tmpdir(), 'news-img-'));
    const store = new DiskNewsImageStorage(dir);
    const file = await store.save(TINY_PNG, 'png');
    const read = await store.read(file);
    expect(read?.bytes.length).toBe(TINY_PNG.length);
    await store.remove(file);
    expect(await store.read(file)).toBeNull();
  });
});

describe('NEWS_IMAGE_MAX_BYTES', () => {
  it('is 2 MiB', () => {
    expect(NEWS_IMAGE_MAX_BYTES).toBe(2 * 1024 * 1024);
  });
});
