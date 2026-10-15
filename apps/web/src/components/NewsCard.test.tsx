import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicNewsItem } from '../lib/newsApi';
import { NewsCard } from './NewsCard';

const baseItem: PublicNewsItem = {
  id: 'n1',
  sourceUrl: 'https://xiangqiweekly.example/story-1',
  title: 'Championship update',
  summary: 'Three players are level on points going into the last round of the national event.',
  publisher: 'Xiangqi Weekly',
  sourceDomain: 'xiangqiweekly.example',
  imageUrl: 'https://xiangqiweekly.example/thumb.jpg',
  sortAt: '2026-10-14T14:00:00.000Z',
  tags: ['tournament'],
};

describe('NewsCard', () => {
  it('links to the source with security attributes', () => {
    render(<NewsCard item={baseItem} />);
    const link = screen.getByRole('link', {
      name: 'Championship update — Xiangqi Weekly (opens in new tab)',
    });
    expect(link).toHaveAttribute('href', baseItem.sourceUrl);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows domain badge initial and read on publisher', () => {
    render(<NewsCard item={baseItem} />);
    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.getByText('xiangqiweekly.example')).toBeInTheDocument();
    expect(screen.getByText(/Read on Xiangqi Weekly/)).toBeInTheDocument();
  });

  it('shows placeholder when imageUrl is missing', () => {
    render(<NewsCard item={{ ...baseItem, imageUrl: undefined }} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('象')).toBeInTheDocument();
  });

  it('resolves server-relative imageUrl for img src', () => {
    const uploaded = '/api/news/images/550e8400-e29b-41d4-a716-446655440000.webp';
    render(<NewsCard item={{ ...baseItem, imageUrl: uploaded }} />);
    const img = screen.getByRole('img', { name: 'Thumbnail from Xiangqi Weekly' });
    expect(img).toHaveAttribute('src', uploaded);
  });

  it('shows placeholder after image error', () => {
    render(<NewsCard item={baseItem} />);
    const img = screen.getByRole('img', { name: 'Thumbnail from Xiangqi Weekly' });
    fireEvent.error(img);
    expect(screen.getByText('象')).toBeInTheDocument();
  });
});
