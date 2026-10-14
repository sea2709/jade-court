/** Loading skeleton grid for the public news feed (six cards). */

export function NewsSkeletonGrid() {
  return (
    <div
      className="news-grid"
      aria-busy="true"
      aria-label="Loading news"
      data-testid="news-skeleton-grid"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="news-skeleton">
          <div className="news-skeleton-thumb news-shimmer" />
          <div className="news-skeleton-body">
            <div className="news-shimmer news-skeleton-pill" />
            <div className="news-shimmer news-skeleton-bar news-skeleton-bar-92" />
            <div className="news-shimmer news-skeleton-bar news-skeleton-bar-70" />
            <div className="news-shimmer news-skeleton-bar-sm news-skeleton-bar-100" />
            <div className="news-shimmer news-skeleton-bar-sm news-skeleton-bar-85" />
            <div className="news-shimmer news-skeleton-bar-sm news-skeleton-bar-55" />
          </div>
        </div>
      ))}
    </div>
  );
}
