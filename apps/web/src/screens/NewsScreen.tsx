/**
 * Public curated Xiangqi news feed at `/news`.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { NewsCard } from '../components/NewsCard';
import { NewsSkeletonGrid } from '../components/NewsSkeletonGrid';
import { fetchPublicNews, type PublicNewsItem } from '../lib/newsApi';

function WifiOffIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 2l20 20" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M5 12.9a10 10 0 0 1 5.2-2.8" />
      <path d="M19 12.9a10 10 0 0 0-2.3-1.6" />
      <path d="M12 20h.01" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}

type LoadPhase = 'idle' | 'loading' | 'loading-more' | 'ready' | 'error';

export function NewsScreen() {
  const [items, setItems] = useState<PublicNewsItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [phase, setPhase] = useState<LoadPhase>('loading');
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    document.title = 'Xiangqi news · Jade Court';
  }, []);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const loadFirstPage = useCallback(async () => {
    setPhase('loading');
    setLoadMoreError(null);
    try {
      const res = await fetchPublicNews();
      setItems(res.items);
      setNextCursor(res.nextCursor);
      setPhase('ready');
      setHasLoadedOnce(true);
    } catch {
      setPhase('error');
      setHasLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoadMoreError(null);
      try {
        const res = await fetchPublicNews();
        if (cancelled) return;
        setItems(res.items);
        setNextCursor(res.nextCursor);
        setPhase('ready');
        setHasLoadedOnce(true);
      } catch {
        if (!cancelled) {
          setPhase('error');
          setHasLoadedOnce(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = async () => {
    if (!nextCursor || phase === 'loading-more') return;
    setPhase('loading-more');
    setLoadMoreError(null);
    try {
      const res = await fetchPublicNews({ cursor: nextCursor });
      setItems((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setPhase('ready');
    } catch {
      setLoadMoreError('Could not load more stories.');
      setPhase('ready');
    }
  };

  const showSkeleton = phase === 'loading';
  const showEmpty = phase === 'ready' && items.length === 0;
  const showError = phase === 'error';
  const showGrid = phase === 'ready' || phase === 'loading-more';

  return (
    <main className="news-page">
      <header className="news-header">
        <span className="news-eyebrow">新聞 · From around the Xiangqi world</span>
        <h1 className="news-title">Xiangqi news</h1>
        <p className="news-subtitle">
          Tournaments, players, culture and study resources, picked by our curators. Each story
          opens on the publisher&apos;s own site.
        </p>
      </header>

      {showSkeleton ? <NewsSkeletonGrid /> : null}

      {showEmpty ? (
        <div className="news-panel news-panel-empty">
          <span className="news-panel-icon news-panel-icon-jade" aria-hidden="true">
            報
          </span>
          <h2 className="news-panel-heading">No news yet — check back soon</h2>
          <p className="news-panel-text">
            Our curators are gathering the first stories. In the meantime, sharpen your game with
            Master Lin.
          </p>
          <Link to="/learn" className="btn btn-primary news-empty-cta">
            Start learning →
          </Link>
        </div>
      ) : null}

      {showError ? (
        <div className="news-panel news-panel-error" role="alert">
          <span className="news-panel-icon news-panel-icon-red" aria-hidden="true">
            斷
          </span>
          <h2 className="news-panel-heading">We couldn&apos;t load the news</h2>
          <p className="news-panel-text">
            Something went wrong on our side. Give it another try in a moment.
          </p>
          {offline ? (
            <p className="news-offline-note">
              <WifiOffIcon />
              You&apos;re offline. News will load when you reconnect.
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost news-retry-btn"
            onClick={() => void loadFirstPage()}
          >
            <RefreshIcon />
            Try again
          </button>
        </div>
      ) : null}

      {showGrid && items.length > 0 ? (
        <>
          <div className="news-grid">
            {items.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
          <div className="news-pagination">
            {nextCursor ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost news-load-more-btn"
                  disabled={phase === 'loading-more'}
                  onClick={() => void loadMore()}
                >
                  {phase === 'loading-more' ? 'Loading…' : 'Load more stories'}
                </button>
                {loadMoreError ? (
                  <p className="news-load-more-error" role="alert">
                    {loadMoreError}{' '}
                    <button
                      type="button"
                      className="news-inline-retry"
                      onClick={() => void loadMore()}
                    >
                      Retry
                    </button>
                  </p>
                ) : null}
              </>
            ) : hasLoadedOnce && items.length > 0 ? (
              <p className="news-caught-up">You&apos;re all caught up.</p>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}
