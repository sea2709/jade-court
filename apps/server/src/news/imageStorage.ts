/**
 * Curator-uploaded news thumbnails (disk or in-memory for tests).
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export const NEWS_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Multipart boundaries/headers — `bodyLimit` measures the full request body. */
export const NEWS_IMAGE_UPLOAD_BODY_OVERHEAD_BYTES = 16 * 1024;

export const NEWS_IMAGE_UPLOAD_MAX_BODY_BYTES =
  NEWS_IMAGE_MAX_BYTES + NEWS_IMAGE_UPLOAD_BODY_OVERHEAD_BYTES;

/** Server-relative path stored on news documents for uploaded thumbnails. */
export const UPLOADED_IMAGE_PATH_RE =
  /^\/api\/news\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

/** Basename-only pattern for safe reads (blocks traversal). */
export const UPLOADED_IMAGE_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

export type NewsImageExt = 'jpg' | 'png' | 'webp';

export interface NewsImageStorage {
  save(bytes: Uint8Array, ext: NewsImageExt): Promise<string>;
  read(file: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  remove(file: string): Promise<void>;
}

/** Whether `imageUrl` is our hosted upload path (not an external https URL). */
export function isUploadedImagePath(imageUrl: string): boolean {
  return UPLOADED_IMAGE_PATH_RE.test(imageUrl.trim());
}

/** Extract stored basename from an uploaded `imageUrl`, or null. */
export function uploadedImageFilename(imageUrl: string | undefined): string | null {
  if (!imageUrl || !isUploadedImagePath(imageUrl)) return null;
  const base = imageUrl.trim().slice(imageUrl.lastIndexOf('/') + 1);
  return UPLOADED_IMAGE_FILENAME_RE.test(base) ? base : null;
}

/** Detect JPEG, PNG, or WebP from magic bytes (not Content-Type). */
export function sniffImageType(bytes: Uint8Array): NewsImageExt | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

export function contentTypeForExt(ext: NewsImageExt): string {
  switch (ext) {
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
  }
}

function assertSafeFilename(file: string): void {
  if (!UPLOADED_IMAGE_FILENAME_RE.test(file)) {
    throw new Error('invalid_filename');
  }
}

/** Default directory: `<repoRoot>/data/news-images` unless `NEWS_IMAGE_DIR` is set. */
export function defaultNewsImageDir(): string {
  if (process.env.NEWS_IMAGE_DIR?.trim()) {
    return resolve(process.env.NEWS_IMAGE_DIR.trim());
  }
  const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const repoRoot = resolve(serverRoot, '../..');
  return resolve(repoRoot, 'data/news-images');
}

/** Persist uploads under a directory (created on first write). */
export class DiskNewsImageStorage implements NewsImageStorage {
  constructor(private readonly dir: string) {}

  async save(bytes: Uint8Array, ext: NewsImageExt): Promise<string> {
    const file = `${randomUUID()}.${ext}`;
    assertSafeFilename(file);
    await mkdir(this.dir, { recursive: true });
    await writeFile(resolve(this.dir, file), bytes);
    return file;
  }

  async read(file: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    assertSafeFilename(file);
    try {
      const bytes = await readFile(resolve(this.dir, file));
      const ext = file.slice(file.lastIndexOf('.') + 1) as NewsImageExt;
      return { bytes: new Uint8Array(bytes), contentType: contentTypeForExt(ext) };
    } catch {
      return null;
    }
  }

  async remove(file: string): Promise<void> {
    assertSafeFilename(file);
    try {
      await unlink(resolve(this.dir, file));
    } catch {
      // best-effort cleanup
    }
  }
}

/** In-memory store for unit tests. */
export class MemoryNewsImageStorage implements NewsImageStorage {
  private readonly files = new Map<string, Uint8Array>();

  async save(bytes: Uint8Array, ext: NewsImageExt): Promise<string> {
    const file = `${randomUUID()}.${ext}`;
    assertSafeFilename(file);
    this.files.set(file, bytes);
    return file;
  }

  async read(file: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    assertSafeFilename(file);
    const bytes = this.files.get(file);
    if (!bytes) return null;
    const ext = file.slice(file.lastIndexOf('.') + 1) as NewsImageExt;
    return { bytes, contentType: contentTypeForExt(ext) };
  }

  async remove(file: string): Promise<void> {
    assertSafeFilename(file);
    this.files.delete(file);
  }

  /** Test helper: whether a basename is still stored. */
  has(file: string): boolean {
    return this.files.has(file);
  }
}
