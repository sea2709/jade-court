import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthProvider } from './context/AuthProvider';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(json({ user: null, access: { active: false, accessUntil: null } }));
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<div>Home page</div>} />
            <Route path="play-ai" element={<div>Play AI page</div>} />
            <Route path="multiplayer" element={<div>Multiplayer page</div>} />
            <Route path="news" element={<div>News page</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('App shell', () => {
  it('brand link returns home', async () => {
    renderApp('/play-ai');
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

  it('footer links point to Play with AI, Play with Friends, and News', async () => {
    renderApp('/');
    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getByRole('link', { name: 'Play with AI' })).toHaveAttribute('href', '/play-ai');
    expect(footer.getByRole('link', { name: 'Play with Friends' })).toHaveAttribute(
      'href',
      '/multiplayer',
    );
    expect(footer.getByRole('link', { name: 'News' })).toHaveAttribute('href', '/news');

    await userEvent.click(footer.getByRole('link', { name: 'News' }));
    expect(screen.getByText('News page')).toBeInTheDocument();
  });
});
