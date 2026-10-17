import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { X } from '@jade-court/xiangqi-engine';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISPLAY_NAME_STORAGE_KEY } from '../lib/displayName';
import { MultiplayerScreen } from './MultiplayerScreen';

const fetchMock = vi.fn<typeof fetch>();
const useRoomGameMock = vi.fn();

vi.mock('../hooks/useRoomGame', () => ({
  useRoomGame: (...args: unknown[]) => useRoomGameMock(...args),
}));

vi.mock('../hooks/useRoomChat', () => ({
  useRoomChat: () => ({
    messages: [],
    sendChat: vi.fn(),
    unread: 0,
    setChatVisible: vi.fn(),
    lastRejection: null,
    clearRejection: vi.fn(),
    connected: true,
  }),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderMultiplayer(initialEntry = '/multiplayer') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MultiplayerScreen />
      <LocationProbe />
    </MemoryRouter>,
  );
}

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

  it('renders lobby cards as interactive cards with link-style arrow titles', () => {
    renderMultiplayer();
    expect(screen.getByRole('button', { name: /Create a room/ })).toHaveClass('card-interactive');
    expect(screen.getByRole('button', { name: /Join with a code/ })).toHaveClass(
      'card-interactive',
    );
    expect(screen.getByText('Create a room →')).toHaveClass('card-title-link');
    expect(screen.getByText('Join with a code →')).toHaveClass('card-title-link');
  });

  it('takes the host straight to the board with the invite panel after creating a room', async () => {
    useRoomGameMock.mockReturnValue(baseRoomState);
    fetchMock.mockResolvedValue(
      json({
        code: 'JADE-TEST',
        room: { redName: 'Host', blackName: null, redJoined: true, blackJoined: false },
      }),
    );
    renderMultiplayer();
    await userEvent.click(screen.getByRole('button', { name: /Create a room/ }));
    await waitFor(() => expect(screen.getByTestId('waiting-invite-panel')).toBeInTheDocument());
    expect(useRoomGameMock).toHaveBeenCalledWith('JADE-TEST', 'r');
    expect(screen.getByText('Online', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/Online · JADE/)).not.toBeInTheDocument();
    expect(screen.queryByText('Room JADE-TEST')).not.toBeInTheDocument();
    expect(screen.getByText('JADE–')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('location-search')).toHaveTextContent('?room=JADE-TEST'),
    );
  });

  it('shows Creating… and disables other lobby actions while create is in flight', async () => {
    useRoomGameMock.mockReturnValue(baseRoomState);
    let resolveCreate!: (value: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderMultiplayer();
    await userEvent.click(screen.getByRole('button', { name: /Create a room/ }));
    expect(screen.getByText('Creating…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Join with a code/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Pass-and-play on this device/ })).toBeDisabled();
    resolveCreate(
      json({
        code: 'JADE-PEND',
        room: { redName: 'Host', blackName: null, redJoined: true, blackJoined: false },
      }),
    );
    await waitFor(() => expect(screen.getByTestId('waiting-invite-panel')).toBeInTheDocument());
  });

  it('Back from an invite-link join form returns to the lobby', async () => {
    fetchMock.mockResolvedValue(json({ room: { code: 'JADE-LINK' }, side: null }));
    renderMultiplayer('/multiplayer?room=JADE-LINK');
    await screen.findByRole('heading', { name: 'Join a room' });
    await userEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(await screen.findByRole('heading', { name: 'Play with a Friend' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement());
  });
});

describe('MultiplayerScreen online waiting panel', () => {
  async function createRoomAsHost() {
    fetchMock.mockResolvedValue(json({ code: 'JADE-LIVE', room: { redName: 'Host' } }));
    renderMultiplayer();
    await userEvent.click(screen.getByRole('button', { name: /Create a room/ }));
  }

  it('shows invite panel and a waiting status until the opponent joins', async () => {
    useRoomGameMock.mockReturnValue(baseRoomState);
    await createRoomAsHost();
    await waitFor(() => expect(screen.getByTestId('waiting-invite-panel')).toBeInTheDocument());
    expect(screen.getByText('Waiting for opponent to join…')).toBeInTheDocument();
    expect(screen.queryByText('Your move')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resign-button')).not.toBeInTheDocument();
  });

  it('hides invite panel once opponent has joined', async () => {
    useRoomGameMock.mockReturnValue({
      ...baseRoomState,
      opponentJoined: true,
      blackName: 'Guest',
      blackConnected: true,
    });
    await createRoomAsHost();
    await waitFor(() => expect(screen.getByText('Host (you)')).toBeInTheDocument());
    expect(screen.queryByTestId('waiting-invite-panel')).not.toBeInTheDocument();
    expect(screen.getByText('Guest')).toBeInTheDocument();
    expect(screen.getByText('connected')).toBeInTheDocument();
    expect(screen.getByText('Your move')).toBeInTheDocument();
  });

  it('uses fallback seat labels without names', async () => {
    useRoomGameMock.mockReturnValue({
      ...baseRoomState,
      redName: null,
      blackName: null,
      opponentJoined: true,
      blackConnected: true,
    });
    await createRoomAsHost();
    await waitFor(() => expect(screen.getByText('Red player (you)')).toBeInTheDocument());
    expect(screen.getByText('Black player')).toBeInTheDocument();
  });
});

describe('MultiplayerScreen rejoin from ?room=', () => {
  it('returns a seated player straight to the board', async () => {
    useRoomGameMock.mockReturnValue({
      ...baseRoomState,
      side: 'b',
      opponentJoined: true,
      blackName: 'Lan',
      blackConnected: true,
    });
    fetchMock.mockResolvedValue(json({ room: { code: 'JADE-LIVE' }, side: 'b' }));
    renderMultiplayer('/multiplayer?room=jade-live');
    expect(screen.getByRole('status')).toHaveTextContent('Opening room JADE-LIVE…');
    await waitFor(() => expect(screen.getByText('Lan (you)')).toBeInTheDocument());
    expect(useRoomGameMock).toHaveBeenCalledWith('JADE-LIVE', 'b');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/rooms/JADE-LIVE');
    expect(screen.queryByRole('heading', { name: 'Join a room' })).not.toBeInTheDocument();
  });

  it('shows the join form for an invitee who is not seated', async () => {
    fetchMock.mockResolvedValue(json({ room: { code: 'JADE-LINK' }, side: null }));
    renderMultiplayer('/multiplayer?room=JADE-LINK');
    await screen.findByRole('heading', { name: 'Join a room' });
    expect(screen.getByLabelText('Invite code')).toHaveValue('JADE-LINK');
    expect(useRoomGameMock).not.toHaveBeenCalled();
  });

  it('shows the join form when the room lookup fails', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Room not found' }, 404));
    renderMultiplayer('/multiplayer?room=JADE-GONE');
    await screen.findByRole('heading', { name: 'Join a room' });
    expect(screen.getByLabelText('Invite code')).toHaveValue('JADE-GONE');
    expect(screen.getByLabelText('Invite code')).toHaveAttribute('spellCheck', 'false');
    expect(screen.getByLabelText('Invite code')).toHaveAttribute('autoComplete', 'off');
    expect(screen.getByLabelText('Invite code')).toHaveAttribute('autoCapitalize', 'characters');
  });

  it('maps join API errors to friendly messages', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/join') && init?.method === 'POST') {
        return Promise.resolve(json({ error: 'Room not found' }, 400));
      }
      return Promise.resolve(json({ room: { code: 'JADE-GONE' }, side: null }));
    });
    renderMultiplayer('/multiplayer?room=JADE-GONE');
    await screen.findByRole('heading', { name: 'Join a room' });
    await userEvent.click(screen.getByRole('button', { name: 'Join game →' }));
    expect(
      await screen.findByText('Room not found — check the code with your friend.'),
    ).toBeInTheDocument();
  });

  it('pass-and-play uses Exit game instead of Leave room', async () => {
    renderMultiplayer();
    await userEvent.click(screen.getByRole('button', { name: /Pass-and-play on this device/ }));
    expect(screen.getByRole('button', { name: '← Exit game' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '← Leave room' })).not.toBeInTheDocument();
  });

  it('Leave room clears ?room= and stays in the lobby', async () => {
    useRoomGameMock.mockReturnValue({ ...baseRoomState, opponentJoined: true });
    fetchMock.mockResolvedValue(json({ room: { code: 'JADE-LIVE' }, side: 'r' }));
    renderMultiplayer('/multiplayer?room=JADE-LIVE');
    await userEvent.click(await screen.findByRole('button', { name: '← Leave room' }));
    expect(await screen.findByRole('heading', { name: 'Play with a Friend' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
