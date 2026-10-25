import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthProvider';
import { PlayScreen } from './PlayScreen';

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderPlay() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <PlayScreen />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/me')) {
      return Promise.resolve(json({ user: null, access: { active: false, accessUntil: null } }));
    }
    return Promise.resolve(json({ error: 'not_found' }, 404));
  });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('PlayScreen setup', () => {
  it('renders level cards as interactive cards with link-style names', async () => {
    renderPlay();
    await waitFor(() => expect(screen.getByText('Play vs Computer')).toBeInTheDocument());
    for (const name of ['Beginner', 'Intermediate', 'Advanced']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toHaveClass(
        'level-card',
        'card-interactive',
      );
      expect(screen.getByText(name)).toHaveClass('card-title-link');
    }
  });

  it('marks the clicked level card as selected', async () => {
    renderPlay();
    await waitFor(() => expect(screen.getByText('Play vs Computer')).toBeInTheDocument());
    const beginner = screen.getByRole('button', { name: /Beginner/ });
    const intermediate = screen.getByRole('button', { name: /Intermediate/ });
    expect(intermediate).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(beginner);

    expect(beginner).toHaveAttribute('aria-pressed', 'true');
    expect(beginner).toHaveClass('level-card-active');
    expect(intermediate).toHaveAttribute('aria-pressed', 'false');
  });
});
