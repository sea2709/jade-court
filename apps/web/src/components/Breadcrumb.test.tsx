import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PUBLIC_NAV } from '../lib/publicNav';
import { Breadcrumb } from './Breadcrumb';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Breadcrumb nav={PUBLIC_NAV} />
    </MemoryRouter>,
  );
}

describe('Breadcrumb', () => {
  it('renders nothing at /', () => {
    const { container } = renderAt('/');
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['/learn', 'Learn with AI'],
    ['/play', 'Play vs Computer'],
    ['/multiplayer', 'Play with Friends'],
    ['/news', 'News'],
  ] as const)('renders Home / %s for %s', (path, sectionLabel) => {
    renderAt(path);
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(trail).toHaveTextContent(`Home/${sectionLabel}`);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    const current = screen.getByText(sectionLabel);
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.tagName).not.toBe('A');
  });

  it('ignores query strings on the path', () => {
    renderAt('/multiplayer?room=JADE-ABCD');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(
      'Home/Play with Friends',
    );
    expect(screen.queryByText(/JADE-ABCD/)).not.toBeInTheDocument();
  });

  it('renders nothing for an unknown path', () => {
    const { container } = renderAt('/not-a-route');
    expect(container).toBeEmptyDOMElement();
  });

  it('marks separators as aria-hidden', () => {
    renderAt('/play');
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const hidden = trail.querySelector('[aria-hidden="true"]');
    expect(hidden).toHaveTextContent('/');
  });
});
