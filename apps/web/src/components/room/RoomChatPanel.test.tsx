import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DisplayChatRow } from '../../lib/roomChatTypes';
import { ROOM_CHAT_COLLAPSED_KEY } from '../../lib/roomChatTypes';
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

  it('sends on Enter and clears the input', async () => {
    const onSend = vi.fn();
    render(<RoomChatPanel {...baseProps} onSend={onSend} />);
    const input = screen.getByTestId('room-chat-input');
    await userEvent.type(input, 'Hello{Enter}');
    expect(onSend).toHaveBeenCalledWith('Hello');
    expect(input).toHaveValue('');
  });

  it('does not send empty input', async () => {
    const onSend = vi.fn();
    render(<RoomChatPanel {...baseProps} onSend={onSend} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables input while disconnected', () => {
    render(<RoomChatPanel {...baseProps} connected={false} />);
    expect(screen.getByTestId('room-chat-input')).toBeDisabled();
    expect(screen.getByText('Reconnecting… chat is paused')).toBeVisible();
  });

  it('shows counter and blocks send over 500 characters', async () => {
    const onSend = vi.fn();
    render(<RoomChatPanel {...baseProps} onSend={onSend} />);
    const input = screen.getByTestId('room-chat-input');
    await userEvent.type(input, 'x'.repeat(401));
    expect(screen.getByTestId('room-chat-counter')).toBeVisible();
    await userEvent.type(input, 'x'.repeat(100));
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(input).toHaveClass('room-chat-input-over');
  });

  it('restores rejected text and shows rate-limit copy', () => {
    render(
      <RoomChatPanel {...baseProps} lastRejection={{ error: 'rate_limited', text: 'slow down' }} />,
    );
    expect(
      screen.getByText("You're sending messages too fast. Wait a few seconds and try again."),
    ).toBeVisible();
    expect(screen.getByTestId('room-chat-input')).toHaveValue('slow down');
  });

  it('renders message text as plain text (no HTML injection)', () => {
    const payload = '<img src=x onerror=alert(1)>';
    render(
      <RoomChatPanel
        {...baseProps}
        messages={[{ kind: 'message', id: '1', side: 'b', text: payload, createdAt: Date.now() }]}
      />,
    );
    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows names on message groups', () => {
    render(
      <RoomChatPanel
        {...baseProps}
        messages={[{ kind: 'message', id: '1', side: 'b', text: 'Hi', createdAt: Date.now() }]}
      />,
    );
    expect(screen.getByText('Lan')).toBeVisible();
  });

  it('renders system lines with names', () => {
    render(
      <RoomChatPanel
        {...baseProps}
        messages={[
          {
            kind: 'system',
            id: 's',
            event: 'joined',
            side: 'b',
            createdAt: Date.now(),
          },
        ]}
      />,
    );
    expect(screen.getByTestId('room-chat-system-line')).toHaveTextContent('Lan joined the room');
  });

  it('collapses on desktop and persists preference', async () => {
    const onVisibilityChange = vi.fn();
    render(<RoomChatPanel {...baseProps} onVisibilityChange={onVisibilityChange} />);
    await userEvent.click(screen.getByTestId('room-chat-collapse'));
    expect(screen.getByTestId('room-chat-collapsed')).toBeVisible();
    expect(localStorage.getItem(ROOM_CHAT_COLLAPSED_KEY)).toBe('1');
    expect(onVisibilityChange).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByTestId('room-chat-collapsed'));
    expect(screen.getByTestId('room-chat-panel')).toBeVisible();
    expect(localStorage.getItem(ROOM_CHAT_COLLAPSED_KEY)).toBe('0');
  });

  it('shows unread badge on collapsed row', () => {
    localStorage.setItem(ROOM_CHAT_COLLAPSED_KEY, '1');
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
