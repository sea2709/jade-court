import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayAiGame } from './PlayAiGame';

const { streamCoachPostMock } = vi.hoisted(() => ({
  streamCoachPostMock: vi.fn(),
}));

vi.mock('../lib/coachStream', () => ({
  streamCoachPost: (...args: unknown[]) => streamCoachPostMock(...args),
}));

const square = (container: HTMLElement, rc: string) =>
  container.querySelector<HTMLElement>(`[data-square="${rc}"]`);

const fetchMock = vi.fn<typeof fetch>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  streamCoachPostMock.mockImplementation(async (_path, _body, handlers) => {
    handlers?.onDone?.('llm');
  });
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/api/ai/models')) {
      return Promise.resolve(
        json({
          models: [
            { id: 'm1', label: 'Model One', blurb: 'Quick replies' },
            { id: 'm2', label: 'Model Two' },
          ],
          defaultId: 'm1',
        }),
      );
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
  streamCoachPostMock.mockReset();
  vi.unstubAllGlobals();
});

describe('PlayAiGame model UI', () => {
  it('shows running model label and blurb under the board', async () => {
    render(
      <PlayAiGame
        accessUntil={new Date(Date.now() + 3600_000).toISOString()}
        preferredModelId={null}
      />,
    );
    await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());
    expect(screen.getByText(/running Model One · Quick replies/)).toBeInTheDocument();
  });

  it('retries batch hint with modelId when the stream emits error', async () => {
    streamCoachPostMock.mockImplementation(async (path, _body, handlers) => {
      if (String(path).includes('hint')) handlers?.onError?.('upstream_down');
    });
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/api/coach/hint') && !url.includes('/stream')) {
        expect(JSON.parse(String(init?.body)).modelId).toBe('m1');
        return Promise.resolve(
          json({
            text: 'Batch hint from preset',
            tip: 'Look at the center',
            move: { from: [6, 0], to: [5, 0] },
          }),
        );
      }
      if (url.includes('/api/ai/models')) {
        return Promise.resolve(
          json({
            models: [{ id: 'm1', label: 'Model One' }],
            defaultId: 'm1',
          }),
        );
      }
      if (url.includes('/api/coach/opening')) {
        return Promise.resolve(json({ text: 'Welcome', source: 'llm' }));
      }
      if (url.includes('/api/ai/move')) {
        return Promise.resolve(json({ error: 'access_required' }, 402));
      }
      return Promise.resolve(json({}));
    });

    render(
      <PlayAiGame
        accessUntil={new Date(Date.now() + 3600_000).toISOString()}
        preferredModelId={null}
      />,
    );
    await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Show me a hint/i }));

    await waitFor(() => expect(screen.getByText('Batch hint from preset')).toBeInTheDocument());
  });

  it('posts a system message when the model picker changes', async () => {
    render(
      <PlayAiGame
        accessUntil={new Date(Date.now() + 3600_000).toISOString()}
        preferredModelId={null}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText('AI model')).toBeEnabled());
    await userEvent.selectOptions(screen.getByLabelText('AI model'), 'm2');
    expect(screen.getByText('Master Lin (AI) now runs on Model Two')).toBeInTheDocument();
  });
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
