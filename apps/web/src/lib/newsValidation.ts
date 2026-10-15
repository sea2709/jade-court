/** Allowed tag values for curated news items. */
export const NEWS_TAG_OPTIONS = [
  'tournament',
  'players',
  'culture',
  'learning',
  'engines',
  'community',
] as const;

export type NewsTag = (typeof NEWS_TAG_OPTIONS)[number];

export interface NewsFormFields {
  sourceUrl: string;
  title: string;
  summary: string;
  publisher: string;
  publishedAt: string;
  imageUrl: string;
  tags: string[];
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Must match server `UPLOADED_IMAGE_PATH_RE` in `apps/server/src/news/imageStorage.ts`. */
const UPLOADED_IMAGE_PATH_RE =
  /^\/api\/news\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

function isValidNewsImageUrl(value: string): boolean {
  const trimmed = value.trim();
  return isHttpsUrl(trimmed) || UPLOADED_IMAGE_PATH_RE.test(trimmed);
}

/** Draft saves require only a valid http(s) source URL. */
export function validateNewsDraft(
  fields: Pick<NewsFormFields, 'sourceUrl'>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const url = fields.sourceUrl.trim();
  if (!url) {
    errors.sourceUrl = 'Source URL is required';
  } else if (!isHttpUrl(url)) {
    errors.sourceUrl = 'Enter a valid http or https URL';
  }
  return errors;
}

/** Publish requires title, summary, publisher, and optional https image. */
export function validateNewsPublish(fields: NewsFormFields): Record<string, string> {
  const errors = validateNewsDraft(fields);
  const title = fields.title.trim();
  if (title.length < 1 || title.length > 160) {
    errors.title = 'Title must be 1–160 characters';
  }
  const summary = fields.summary.trim();
  if (summary.length < 20 || summary.length > 300) {
    errors.summary = 'Summary must be 20–300 characters';
  }
  if (!fields.publisher.trim()) {
    errors.publisher = 'Publisher is required';
  }
  const image = fields.imageUrl.trim();
  if (image && !isValidNewsImageUrl(image)) {
    errors.imageUrl = 'Image URL must use https or an uploaded thumbnail';
  }
  for (const tag of fields.tags) {
    if (!(NEWS_TAG_OPTIONS as readonly string[]).includes(tag)) {
      errors.tags = 'Invalid tag selected';
      break;
    }
  }
  return errors;
}
