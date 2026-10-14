/**
 * External-link card for a single curated news story on the public feed.
 */
import { useState } from 'react';
import type { PublicNewsItem } from '../lib/newsApi';
import { formatNewsDateAbsolute, formatNewsDateRelative, newsDateIso } from '../lib/formatNewsDate';

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export interface NewsCardProps {
  item: PublicNewsItem;
}

export function NewsCard({ item }: NewsCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPlaceholder = !item.imageUrl || imgFailed;
  const iso = newsDateIso(item.publishedAt, item.sortAt);
  const relative = formatNewsDateRelative(item.publishedAt, item.sortAt);
  const absolute = formatNewsDateAbsolute(iso);
  const initial = item.publisher.trim().charAt(0).toUpperCase() || '?';
  const ariaLabel = `${item.title} — ${item.publisher} (opens in new tab)`;

  return (
    <a
      href={item.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className="news-card"
    >
      <div className="news-card-thumb">
        {showPlaceholder ? (
          <div className="news-card-placeholder" aria-hidden="true">
            <span className="news-card-placeholder-glyph">象</span>
          </div>
        ) : (
          <img
            src={item.imageUrl}
            alt={`Thumbnail from ${item.publisher}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        )}
        <span className="news-card-domain">
          <span className="news-card-domain-initial">{initial}</span>
          {item.sourceDomain}
        </span>
      </div>
      <div className="news-card-body">
        {item.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <span key={tag} className="news-tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <h2 className="news-card-title">{item.title}</h2>
        <p className="news-card-summary">{item.summary}</p>
        <div className="news-card-meta">
          <span className="font-extrabold text-ink">{item.publisher}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={iso} title={absolute}>
            {relative}
          </time>
          <span className="news-card-read">
            Read on {item.publisher}
            <ExternalLinkIcon />
          </span>
        </div>
      </div>
    </a>
  );
}
