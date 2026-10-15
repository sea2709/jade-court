import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { X } from '@jade-court/xiangqi-engine';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISPLAY_NAME_STORAGE_KEY } from '../lib/displayName';
import { MultiplayerScreen } from './MultiplayerScreen';

const fetchMock = vi.fn<typeof fetch>();
const useRoomGameMock = vi.fn();

vi.mock('../hooks/useRoomGame', () => ({
  useRoomGame: (...args: unknown[]) => useRoomGameMock(...args),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderMultiplayer(initialEntry = '/multiplayer') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MultiplayerScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('jade-court-guest-id', 'guest-test');
  vi.stubGlobal('fetch', fetchMock);
  useRoomGameMock.mockReset();
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('MultiplayerScreen lobby', () => {
  it('prefills Your name from localStorage', () => {
    localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, 'Dang');
    renderMultiplayer();
    expect(screen.getByLabelText('Your name')).toHaveValue('Dang');
  });

  it('shows character counter and enforces max length', async () => {
    renderMultiplayer();
    const input = screen.getByLabelText('Your name');
    const long = 'a'.repeat(25);
    await userEvent.type(input, long);
    expect(input).toHaveValue('a'.repeat(20));
    expect(screen.getByText('20/20')).toBeInTheDocument();
  });

  it('shows invite share UI after creating a room', async () => {
    fetchMock.mockResolvedValue(
      json({
        code: 'JADE-TEST',
        room: { redName: 'Host', blackName: null, redJoined: true, blackJoined: false },
      }),
    );
    renderMultiplayer();
    await userEvent.click(screen.getByRole('button', { name: /Create a room/ }));
    await waitFor(() => expect(screen.getByTestId('room-invite-share')).toBeInTheDocument());
    expect(screen.getByText('J A D E –')).toBeInTheDocument();
    expect(screen.getByText(/You'll play Red 帥 as Host/)).toBeInTheDocument();
  });
});

describe('MultiplayerScreen online waiting panel', () => {
  const baseRoomState = {
    board: X.initialBoard(),
    turn: 'r' as const,
    history: [],
    status: null,
    winner: null,
    lastMove: null,
    selected: null,
    targets: [],
    checkPos: null,
    checkSide: null,
    connected: true,
    opponentJoined: false,
    redName: 'Host',
    blackName: null,
    redConnected: true,
    blackConnected: false,
    error: null,
    onPoint: vi.fn(),
    resetLocal: vi.fn(),
    resign: vi.fn(),
    side: 'r' as const,
    guestId: 'guest-test',
  };

  it('shows invite panel for host until opponent joins', async () => {
    useRoomGameMock.mockReturnValue(baseRoomState);
    fetchMock.mockResolvedValue(
      json({
        code: 'JADE-LIVE',
        room: { redName: 'Host', blackName: null },
      }),
    );
    renderMultiplayer();
    await userEvent.click(screen.getByRole('button', { name: /Create a room/ }));
    await waitFor(() => expect(screen.getByTestId('room-invite-share')).toBeInTheDocument());
    await userEvent.click(
      screen.getByRole('button', { name: 'Start game (waiting for opponent)' }),
    );
    expect(screen.getByTestId('waiting-invite-panel')).toBeInTheDocument();
  });

  it('hides invite panel once opponent has joined', async () => {
    useRoomGameMock.mockReturnValue({
      ...baseRoomState,
      opponentJoined: true,
      blackName: 'Guest',
      blackConnected: true,
    });
    fetchMock.mockResolvedValue(json({ code: 'JADE-LIVE', room: { redName: 'Host' } }));
    renderMultiplayer();
    await userEvent.click(screen.getByRole('button', { name: /Create a room/ }));
    await waitFor(() => expect(screen.getByTestId('room-invite-share')).toBeInTheDocument());
    await userEvent.click(
      screen.getByRole('button', { name: 'Start game (waiting for opponent)' }),
    );
    expect(screen.queryByTestId('waiting-invite-panel')).not.toBeInTheDocument();
    expect(screen.getByText('Host (you)')).toBeInTheDocument();
    expect(screen.getByText('Guest')).toBeInTheDocument();
    expect(screen.getByText('connected')).toBeInTheDocument();
  });

  it('uses fallback seat labels without names', async () => {
    useRoomGameMock.mockReturnValue({
      ...baseRoomState,
      redName: null,
      blackName: null,
      opponentJoined: true,
      blackConnected: true,
    });
    fetchMock.mockResolvedValue(json({ code: 'JADE-LIVE', room: {} }));
    renderMultiplayer();
    await userEvent.click(screen.getByRole('button', { name: /Create a room/ }));
    await waitFor(() => expect(screen.getByTestId('room-invite-share')).toBeInTheDocument());
    await userEvent.click(
      screen.getByRole('button', { name: 'Start game (waiting for opponent)' }),
    );
    expect(screen.getByText('Red player (you)')).toBeInTheDocument();
    expect(screen.getByText('Black player')).toBeInTheDocument();
  });
});
