import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { HomeScreen } from './HomeScreen';

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/play-ai" element={<div>Play AI page</div>} />
        <Route path="/play" element={<div>Play page</div>} />
        <Route path="/multiplayer" element={<div>Multiplayer page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  localStorage.clear();
});

describe('HomeScreen', () => {
  it('renders hero calls to action as links', () => {
    renderHome();
    expect(screen.getByRole('link', { name: 'Play with AI →' })).toHaveAttribute(
      'href',
      '/play-ai',
    );
    expect(screen.getByRole('link', { name: 'Play vs computer' })).toHaveAttribute('href', '/play');
  });

  it('renders each mode card as a link to its screen', () => {
    renderHome();
    const playAiLinks = screen.getAllByRole('link', { name: /Play with AI/ });
    expect(playAiLinks.some((l) => l.getAttribute('href') === '/play-ai')).toBe(true);
    expect(screen.getByRole('link', { name: /Play vs Computer/ })).toHaveAttribute('href', '/play');
    expect(screen.getByRole('link', { name: /Play with Friends/ })).toHaveAttribute(
      'href',
      '/multiplayer',
    );
  });

  it('navigates when a mode card is clicked', async () => {
    renderHome();
    await userEvent.click(screen.getByRole('link', { name: /Play with Friends/ }));
    expect(screen.getByText('Multiplayer page')).toBeInTheDocument();
  });
});
