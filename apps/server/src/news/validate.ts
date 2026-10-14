/**
 * Hand-written validation for news create/update payloads (draft vs published rules).
 */
import {
  NEWS_STATUSES,
  NEWS_TAGS,
  type CreateNewsInput,
  type NewsStatus,
  type NewsTag,
  type UpdateNewsInput,
} from './types.js';
import { isHttpOrHttpsUrl, isHttpsUrl, normalizeNewsUrl } from './normalizeUrl.js';

export const FIELD_LIMITS = {
  title: 160,
  summary: 300,
  publisher: 120,
  sourceUrl: 2048,
  imageUrl: 2048,
} as const;

export type ValidationFields = Record<string, string>;

export type ValidationResult =
  { ok: true; data: NormalizedNewsPayload } | { ok: false; fields: ValidationFields };

export interface NormalizedNewsPayload {
  sourceUrl: string;
  normalizedUrl: string;
  sourceDomain: string;
  title: string;
  summary: string;
  publisher: string;
  publishedAt?: Date;
  imageUrl?: string;
  tags: NewsTag[];
  status: NewsStatus;
}

function trimCap(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function parseOptionalDate(value: unknown): Date | undefined | 'invalid' {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return 'invalid';
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return 'invalid';
  return d;
}

function parseTags(value: unknown, fields: ValidationFields): NewsTag[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    fields.tags = 'must be an array';
    return null;
  }
  const tags: NewsTag[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !NEWS_TAGS.includes(item as NewsTag)) {
      fields.tags = `must be a subset of ${NEWS_TAGS.join(', ')}`;
      return null;
    }
    if (!tags.includes(item as NewsTag)) tags.push(item as NewsTag);
  }
  return tags;
}

function parseStatus(value: unknown, fields: ValidationFields): NewsStatus | null {
  if (value === undefined || value === null) return 'draft';
  if (typeof value !== 'string' || !NEWS_STATUSES.includes(value as NewsStatus)) {
    fields.status = 'must be draft, published, or archived';
    return null;
  }
  return value as NewsStatus;
}

/** Whether published-field rules apply for this save. */
export function requiresPublishedFields(status: NewsStatus): boolean {
  return status === 'published';
}

/**
 * Validate a create payload. Drafts need only sourceUrl; publishing requires full fields.
 */
export function validateCreateInput(body: unknown): ValidationResult {
  const fields: ValidationFields = {};
  if (!body || typeof body !== 'object') {
    return { ok: false, fields: { body: 'invalid JSON object' } };
  }
  const o = body as Record<string, unknown>;

  const sourceUrlRaw = o.sourceUrl;
  if (typeof sourceUrlRaw !== 'string' || !sourceUrlRaw.trim()) {
    fields.sourceUrl = 'required';
    return { ok: false, fields };
  }
  const sourceUrl = trimCap(sourceUrlRaw, FIELD_LIMITS.sourceUrl);
  if (!isHttpOrHttpsUrl(sourceUrl)) {
    fields.sourceUrl = 'must be http or https';
    return { ok: false, fields };
  }
  const norm = normalizeNewsUrl(sourceUrl);
  if (!norm.ok) {
    fields.sourceUrl = 'invalid URL';
    return { ok: false, fields };
  }

  const status = parseStatus(o.status, fields);
  if (status === null) return { ok: false, fields };

  const tags = parseTags(o.tags, fields);
  if (tags === null) return { ok: false, fields };

  const title = trimCap(o.title, FIELD_LIMITS.title);
  const summary = trimCap(o.summary, FIELD_LIMITS.summary);
  const publisher = trimCap(o.publisher, FIELD_LIMITS.publisher);

  const publishedAtParsed = parseOptionalDate(o.publishedAt);
  if (publishedAtParsed === 'invalid') {
    fields.publishedAt = 'invalid date';
    return { ok: false, fields };
  }

  let imageUrl: string | undefined;
  if (o.imageUrl !== undefined && o.imageUrl !== null && o.imageUrl !== '') {
    const img = trimCap(o.imageUrl, FIELD_LIMITS.imageUrl);
    if (!isHttpsUrl(img)) {
      fields.imageUrl = 'must be https';
      return { ok: false, fields };
    }
    imageUrl = img;
  }

  if (requiresPublishedFields(status)) {
    if (!title) fields.title = 'required when published';
    else if (title.length > FIELD_LIMITS.title)
      fields.title = `max ${FIELD_LIMITS.title} characters`;
    if (!summary || summary.length < 20)
      fields.summary = 'required, 20–300 characters when published';
    else if (summary.length > FIELD_LIMITS.summary)
      fields.summary = `max ${FIELD_LIMITS.summary} characters`;
    if (!publisher) fields.publisher = 'required when published';
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return {
    ok: true,
    data: {
      sourceUrl,
      normalizedUrl: norm.normalized,
      sourceDomain: norm.sourceDomain,
      title,
      summary,
      publisher,
      ...(publishedAtParsed ? { publishedAt: publishedAtParsed } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      tags,
      status,
    },
  };
}

/**
 * Validate a partial update. Merges with existing document fields for publish checks.
 */
export function validateUpdateInput(
  body: unknown,
  existing: {
    sourceUrl: string;
    normalizedUrl: string;
    sourceDomain: string;
    title: string;
    summary: string;
    publisher: string;
    publishedAt?: Date;
    imageUrl?: string;
    tags: NewsTag[];
    status: NewsStatus;
  },
): ValidationResult {
  const fields: ValidationFields = {};
  if (!body || typeof body !== 'object') {
    return { ok: false, fields: { body: 'invalid JSON object' } };
  }
  const o = body as Record<string, unknown>;

  let sourceUrl = existing.sourceUrl;
  let normalizedUrl = existing.normalizedUrl;
  let sourceDomain = existing.sourceDomain;

  if (o.sourceUrl !== undefined) {
    if (typeof o.sourceUrl !== 'string' || !o.sourceUrl.trim()) {
      fields.sourceUrl = 'required';
      return { ok: false, fields };
    }
    sourceUrl = trimCap(o.sourceUrl, FIELD_LIMITS.sourceUrl);
    if (!isHttpOrHttpsUrl(sourceUrl)) {
      fields.sourceUrl = 'must be http or https';
      return { ok: false, fields };
    }
    const norm = normalizeNewsUrl(sourceUrl);
    if (!norm.ok) {
      fields.sourceUrl = 'invalid URL';
      return { ok: false, fields };
    }
    normalizedUrl = norm.normalized;
    sourceDomain = norm.sourceDomain;
  }

  let status = existing.status;
  if (o.status !== undefined) {
    const parsed = parseStatus(o.status, fields);
    if (parsed === null) return { ok: false, fields };
    status = parsed;
  }

  let tags = existing.tags;
  if (o.tags !== undefined) {
    const parsed = parseTags(o.tags, fields);
    if (parsed === null) return { ok: false, fields };
    tags = parsed;
  }

  const title = o.title !== undefined ? trimCap(o.title, FIELD_LIMITS.title) : existing.title;
  const summary =
    o.summary !== undefined ? trimCap(o.summary, FIELD_LIMITS.summary) : existing.summary;
  const publisher =
    o.publisher !== undefined ? trimCap(o.publisher, FIELD_LIMITS.publisher) : existing.publisher;

  let publishedAt = existing.publishedAt;
  if (o.publishedAt !== undefined) {
    if (o.publishedAt === null) {
      publishedAt = undefined;
    } else {
      const parsed = parseOptionalDate(o.publishedAt);
      if (parsed === 'invalid') {
        fields.publishedAt = 'invalid date';
        return { ok: false, fields };
      }
      publishedAt = parsed;
    }
  }

  let imageUrl = existing.imageUrl;
  if (o.imageUrl !== undefined) {
    if (o.imageUrl === null || o.imageUrl === '') {
      imageUrl = undefined;
    } else {
      const img = trimCap(o.imageUrl, FIELD_LIMITS.imageUrl);
      if (!isHttpsUrl(img)) {
        fields.imageUrl = 'must be https';
        return { ok: false, fields };
      }
      imageUrl = img;
    }
  } else if (imageUrl && !isHttpsUrl(imageUrl)) {
    fields.imageUrl = 'must be https';
    return { ok: false, fields };
  }

  if (requiresPublishedFields(status)) {
    if (!title) fields.title = 'required when published';
    if (!summary || summary.length < 20)
      fields.summary = 'required, 20–300 characters when published';
    else if (summary.length > FIELD_LIMITS.summary)
      fields.summary = `max ${FIELD_LIMITS.summary} characters`;
    if (!publisher) fields.publisher = 'required when published';
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return {
    ok: true,
    data: {
      sourceUrl,
      normalizedUrl,
      sourceDomain,
      title,
      summary,
      publisher,
      ...(publishedAt ? { publishedAt } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      tags,
      status,
    },
  };
}

/** Validate preview URL body `{ url: string }`. */
export function validatePreviewUrl(body: unknown): { ok: true; url: string } | { ok: false } {
  if (!body || typeof body !== 'object') return { ok: false };
  const url = (body as { url?: unknown }).url;
  if (typeof url !== 'string' || !url.trim()) return { ok: false };
  const trimmed = url.trim();
  if (!isHttpOrHttpsUrl(trimmed)) return { ok: false };
  return { ok: true, url: trimmed };
}

/** Build create input from validated payload (typed helper). */
export function payloadToCreateInput(data: NormalizedNewsPayload): CreateNewsInput {
  return {
    sourceUrl: data.sourceUrl,
    title: data.title,
    summary: data.summary,
    publisher: data.publisher,
    publishedAt: data.publishedAt,
    imageUrl: data.imageUrl,
    tags: data.tags,
    status: data.status,
  };
}

/** Build update input from validated payload. */
export function payloadToUpdateInput(data: NormalizedNewsPayload): UpdateNewsInput {
  return {
    sourceUrl: data.sourceUrl,
    title: data.title,
    summary: data.summary,
    publisher: data.publisher,
    publishedAt: data.publishedAt ?? null,
    imageUrl: data.imageUrl ?? null,
    tags: data.tags,
    status: data.status,
  };
}
