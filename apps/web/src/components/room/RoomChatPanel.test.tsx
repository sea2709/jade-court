import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DisplayChatRow } from '../../lib/roomChatTypes';
import { RoomChatPanel } from './RoomChatPanel';

const baseProps = {
  messages: [] as DisplayChatRow[],
  viewerSide: 'r' as const,
  redName: 'Minh',
  blackName: 'Lan',
  opponentJoined: true,
  connected: true,
  unread: 0,
  lastRejection: null,
  onSend: vi.fn(),
  onClearRejection: vi.fn(),
  onVisibilityChange: vi.fn(),
};

/** Render the desktop panel and expand it (chat starts collapsed). */
async function renderOpen(props: Partial<ComponentProps<typeof RoomChatPanel>> = {}) {
  const view = render(<RoomChatPanel {...baseProps} {...props} />);
  await userEvent.click(screen.getByTestId('room-chat-collapsed'));
  return view;
}

describe('RoomChatPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: !query.includes('max-width'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  });

  it('starts collapsed on desktop with a down chevron', () => {
    const onVisibilityChange = vi.fn();
    render(<RoomChatPanel {...baseProps} onVisibilityChange={onVisibilityChange} />);
    const row = screen.getByTestId('room-chat-collapsed');
    expect(row).toBeVisible();
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('room-chat-chevron-down')).toBeInTheDocument();
    expect(screen.queryByTestId('room-chat-panel')).toBeNull();
    expect(onVisibilityChange).toHaveBeenCalledWith(false);
    expect(onVisibilityChange).not.toHaveBeenCalledWith(true);
  });

  it('starts collapsed even if an old preference said expanded', () => {
    localStorage.setItem('jade-court-chat-collapsed', '0');
    render(<RoomChatPanel {...baseProps} />);
    expect(screen.getByTestId('room-chat-collapsed')).toBeVisible();
  });

  it('sends on Enter and clears the input', async () => {
    const onSend = vi.fn();
    await renderOpen({ onSend });
    const input = screen.getByTestId('room-chat-input');
    await userEvent.type(input, 'Hello{Enter}');
    expect(onSend).toHaveBeenCalledWith('Hello');
    expect(input).toHaveValue('');
  });

  it('does not send empty input', async () => {
    const onSend = vi.fn();
    await renderOpen({ onSend });
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables input while disconnected', async () => {
    await renderOpen({ connected: false });
    expect(screen.getByTestId('room-chat-input')).toBeDisabled();
    expect(screen.getByText('Reconnecting… chat is paused')).toBeVisible();
  });

  it('shows counter and blocks send over 500 characters', async () => {
    const onSend = vi.fn();
    await renderOpen({ onSend });
    const input = screen.getByTestId('room-chat-input');
    fireEvent.change(input, { target: { value: 'x'.repeat(401) } });
    expect(screen.getByTestId('room-chat-counter')).toBeVisible();
    fireEvent.change(input, { target: { value: 'x'.repeat(501) } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(input).toHaveClass('room-chat-input-over');
  });

  it('restores rejected text and shows rate-limit copy', async () => {
    await renderOpen({ lastRejection: { error: 'rate_limited', text: 'slow down' } });
    expect(
      screen.getByText("You're sending messages too fast. Wait a few seconds and try again."),
    ).toBeVisible();
    expect(screen.getByTestId('room-chat-input')).toHaveValue('slow down');
  });

  it('renders message text as plain text (no HTML injection)', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    await renderOpen({
      messages: [{ kind: 'message', id: '1', side: 'b', text: payload, createdAt: Date.now() }],
    });
    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows names on message groups', async () => {
    await renderOpen({
      messages: [{ kind: 'message', id: '1', side: 'b', text: 'Hi', createdAt: Date.now() }],
    });
    expect(screen.getByText('Lan')).toBeVisible();
  });

  it('renders system lines with names', async () => {
    await renderOpen({
      messages: [
        {
          kind: 'system',
          id: 's',
          event: 'joined',
          side: 'b',
          createdAt: Date.now(),
        },
      ],
    });
    expect(screen.getByTestId('room-chat-system-line')).toHaveTextContent('Lan joined the room');
  });

  it('expands and collapses on desktop with chevron icons', async () => {
    const onVisibilityChange = vi.fn();
    await renderOpen({ onVisibilityChange });
    expect(screen.getByTestId('room-chat-panel')).toBeVisible();
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
    const collapse = screen.getByTestId('room-chat-collapse');
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('room-chat-chevron-up')).toBeInTheDocument();

    await userEvent.click(collapse);
    expect(screen.getByTestId('room-chat-collapsed')).toBeVisible();
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
  });

  it('shows unread badge on collapsed row', () => {
    render(
      <RoomChatPanel
        {...baseProps}
        unread={3}
        messages={[{ kind: 'message', id: '1', side: 'b', text: 'Hey', createdAt: Date.now() }]}
      />,
    );
    expect(screen.getByTestId('room-chat-unread')).toHaveTextContent('3');
  });
});
