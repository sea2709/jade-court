import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from './App';

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<div>Home page</div>} />
          <Route path="learn" element={<div>Learn page</div>} />
          <Route path="multiplayer" element={<div>Multiplayer page</div>} />
          <Route path="news" element={<div>News page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('App shell', () => {
  it('brand link returns home', async () => {
    renderApp('/learn');
    const brand = screen.getByRole('link', { name: /Jade Court/ });
    expect(brand).toHaveAttribute('href', '/');
    await userEvent.click(brand);
    expect(screen.getByText('Home page')).toBeInTheDocument();
  });

  it('brand link is reachable and activated by keyboard', async () => {
    renderApp('/news');
    await userEvent.tab();
    expect(screen.getByRole('link', { name: /Jade Court/ })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('Home page')).toBeInTheDocument();
  });

  it('footer links point to Learn, Play with Friends, and News', async () => {
    renderApp('/');
    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getByRole('link', { name: 'Learn' })).toHaveAttribute('href', '/learn');
    expect(footer.getByRole('link', { name: 'Play with Friends' })).toHaveAttribute(
      'href',
      '/multiplayer',
    );
    expect(footer.getByRole('link', { name: 'News' })).toHaveAttribute('href', '/news');

    await userEvent.click(footer.getByRole('link', { name: 'News' }));
    expect(screen.getByText('News page')).toBeInTheDocument();
  });
});
