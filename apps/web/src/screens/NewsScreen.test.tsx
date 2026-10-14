import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicNewsItem } from '../lib/newsApi';
import { NewsScreen } from './NewsScreen';

const fetchMock = vi.fn<typeof fetch>();

function renderNews() {
  return render(
    <MemoryRouter initialEntries={['/news']}>
      <Routes>
        <Route path="/news" element={<NewsScreen />} />
        <Route path="/learn" element={<div>Learn page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const item: PublicNewsItem = {
  id: '1',
  sourceUrl: 'https://example.com/a',
  title: 'Story one',
  summary: 'Summary text for the first curated story in the feed.',
  publisher: 'Weekly',
  sourceDomain: 'example.com',
  sortAt: '2026-10-14T12:00:00.000Z',
  tags: ['culture'],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  localStorage.setItem('jade-court-guest-id', 'guest');
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('navigator', { ...navigator, onLine: true });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('NewsScreen', () => {
  it('shows six skeleton cards while loading', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    renderNews();
    expect(screen.getByTestId('news-skeleton-grid')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading news')).toBeInTheDocument();
  });

  it('shows empty state copy and learn link', async () => {
    fetchMock.mockResolvedValue(json({ items: [], nextCursor: null }));
    renderNews();
    expect(
      await screen.findByRole('heading', { name: 'No news yet — check back soon' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Our curators are gathering the first stories/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start learning →' })).toHaveAttribute(
      'href',
      '/learn',
    );
  });

  it('shows error state and retries', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(json({ items: [item], nextCursor: null }));
    renderNews();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the news");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /Story one/ })).toBeInTheDocument();
  });

  it('shows offline note when navigator is offline', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    fetchMock.mockRejectedValueOnce(new Error('fail'));
    renderNews();
    expect(await screen.findByText(/You're offline/)).toBeInTheDocument();
  });

  it('load more appends items and shows caught up', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ items: [item], nextCursor: 'page2' }))
      .mockResolvedValueOnce(
        json({
          items: [{ ...item, id: '2', title: 'Story two' }],
          nextCursor: null,
        }),
      );
    renderNews();
    expect(await screen.findByRole('link', { name: /Story one/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more stories' }));
    expect(await screen.findByRole('link', { name: /Story two/ })).toBeInTheDocument();
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
  });

  it('sets document title', async () => {
    fetchMock.mockResolvedValue(json({ items: [], nextCursor: null }));
    renderNews();
    await waitFor(() => {
      expect(document.title).toBe('Xiangqi news · Jade Court');
    });
  });
});
