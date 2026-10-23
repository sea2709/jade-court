import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayAiGame } from './PlayAiGame';

const square = (container: HTMLElement, rc: string) =>
  container.querySelector<HTMLElement>(`[data-square="${rc}"]`);

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/api/ai/models')) {
      return Promise.resolve(json({ models: [{ id: 'm1', label: 'Model One' }], defaultId: 'm1' }));
    }
    if (url.includes('/api/coach/opening')) {
      return Promise.resolve(json({ text: 'Welcome', source: 'llm' }));
    }
    if (url.includes('/api/ai/move')) {
      return Promise.resolve(json({ error: 'access_required' }, 402));
    }
    return Promise.resolve(json({}));
  });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('PlayAiGame 402 handling', () => {
  it('shows renew overlay when opponent move returns access_required', async () => {
    render(
      <PlayAiGame
        accessUntil={new Date(Date.now() + 3600_000).toISOString()}
        preferredModelId={null}
      />,
    );
    await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());

    const board = screen.getByTestId('board');
    fireEvent.click(square(board, '7-1')!);
    fireEvent.click(square(board, '7-4')!);

    await waitFor(
      () => {
        expect(screen.getByRole('dialog', { name: /Day pass expired/i })).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    expect(screen.getByRole('button', { name: '↻ New game' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '↶ Take back' })).toBeDisabled();
  });
});
