import type { AdminNewsItem, NewsPreviewResult } from './newsApi';
import { validateNewsDraft, validateNewsPublish } from './newsValidation';

export interface AdminNewsFormState {
  sourceUrl: string;
  title: string;
  summary: string;
  publisher: string;
  publishedAt: string;
  imageUrl: string;
  tags: string[];
}

export function emptyAdminForm(): AdminNewsFormState {
  return {
    sourceUrl: '',
    title: '',
    summary: '',
    publisher: '',
    publishedAt: '',
    imageUrl: '',
    tags: [],
  };
}

export function formFromItem(item: AdminNewsItem): AdminNewsFormState {
  return {
    sourceUrl: item.sourceUrl,
    title: item.title,
    summary: item.summary,
    publisher: item.publisher,
    publishedAt: item.publishedAt?.slice(0, 10) ?? '',
    imageUrl: item.imageUrl ?? '',
    tags: [...item.tags],
  };
}

export function applyPreviewToForm(
  form: AdminNewsFormState,
  preview: NewsPreviewResult,
): AdminNewsFormState {
  return {
    ...form,
    sourceUrl: preview.canonicalUrl ?? form.sourceUrl,
    title: preview.title ?? form.title,
    summary: preview.description ?? form.summary,
    publisher: preview.publisher ?? form.publisher,
    publishedAt: preview.publishedAt?.slice(0, 10) ?? form.publishedAt,
    imageUrl: preview.imageUrl ?? form.imageUrl,
  };
}

export function clientValidateDraft(form: AdminNewsFormState) {
  return validateNewsDraft(form);
}

export function clientValidatePublish(form: AdminNewsFormState) {
  return validateNewsPublish(form);
}

/** Shown when a list-row publish is blocked by missing publish fields. */
export const PUBLISH_REQUIREMENTS_MESSAGE =
  "Can't publish yet: add a title, summary (20–300 characters) and publisher";
