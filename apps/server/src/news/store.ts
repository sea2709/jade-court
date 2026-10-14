/**
 * NewsStore abstraction — MongoDB and in-memory implementations share this contract.
 */
import type {
  AdminListOptions,
  AdminNewsItem,
  CreateNewsInput,
  NewsDocument,
  NewsListOptions,
  NewsListResult,
  NewsStatus,
  NewsTag,
  PublicNewsItem,
  UpdateNewsInput,
} from './types.js';
import { toAdminNewsItem, toPublicNewsItem } from './types.js';

export interface NewsStore {
  list(options: NewsListOptions): Promise<NewsListResult<PublicNewsItem>>;
  listAdmin(options: AdminListOptions): Promise<NewsListResult<AdminNewsItem>>;
  get(id: string): Promise<NewsDocument | null>;
  findByNormalizedUrl(normalizedUrl: string): Promise<NewsDocument | null>;
  create(input: CreateNewsInput & NormalizedCreateFields): Promise<NewsDocument>;
  update(id: string, input: UpdateNewsInput & NormalizedUpdateFields): Promise<NewsDocument>;
  remove(id: string): Promise<boolean>;
}

/** Normalized URL fields computed before create. */
export interface NormalizedCreateFields {
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

export interface NormalizedUpdateFields {
  normalizedUrl?: string;
  sourceDomain?: string;
  title?: string;
  summary?: string;
  publisher?: string;
  publishedAt?: Date | null;
  imageUrl?: string | null;
  tags?: NewsTag[];
  status?: NewsStatus;
}

export { toPublicNewsItem, toAdminNewsItem };
