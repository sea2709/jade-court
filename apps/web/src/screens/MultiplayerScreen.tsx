import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X, type Side } from '@jade-court/xiangqi-engine';
import { DisplayNameField } from '../components/DisplayNameField';
import { RoomInviteShare } from '../components/RoomInviteShare';
import { XQBoard } from '../components/XQBoard';
import { createRoom, getRoom, joinRoom } from '../lib/api';
import {
  displayNameForApi,
  getStoredDisplayName,
  opponentSeatLabel,
  saveDisplayNameInput,
  seatLabel,
} from '../lib/displayName';
import { useRoomGame } from '../hooks/useRoomGame';
import { useXiangqiGame } from '../hooks/useXiangqiGame';
import { didSideWin, onlineGameOverSubtitle, type OnlineRoomStatus } from './multiplayerGameOver';

function inviteLinkForCode(code: string): string {
  return `${location.origin}/multiplayer?room=${encodeURIComponent(code)}`;
}

function RoomSeatRow({
  seatSide,
  viewerSide,
  redName,
  blackName,
  joined,
  connected,
}: {
  seatSide: Side;
  viewerSide: Side;
  redName: string | null;
  blackName: string | null;
  joined: boolean;
  connected: boolean;
}) {
  const isYou = seatSide === viewerSide;
  const badge = seatSide === 'r' ? '帥' : '將';
  const badgeTone = seatSide === 'r' ? 'bg-red-deep' : 'bg-black-deep';

  if (!joined) {
    return (
      <div className="flex items-center gap-2.5 py-2 text-muted font-semibold text-[13.5px]">
        <span
          className={`w-7 h-7 rounded-lg grid place-items-center text-white text-sm font-extrabold ${badgeTone}`}
        >
          {badge}
        </span>
        <span>Waiting for opponent…</span>
      </div>
    );
  }

  const name = seatLabel(seatSide, redName, blackName);
  const showConnected = !isYou && connected;

  return (
    <div className="flex items-center gap-2.5 py-2 text-[13.5px] font-semibold text-ink-soft">
      <span
        className={`w-7 h-7 rounded-lg grid place-items-center text-white text-sm font-extrabold shrink-0 ${badgeTone}`}
      >
        {badge}
      </span>
      <span className="text-ink font-bold">
        {name}
        {isYou ? ' (you)' : ''}
      </span>
      {showConnected && <span className="text-jade-deep font-bold text-[12.5px]">connected</span>}
    </div>
  );
}

function PassPlay({ onExit }: { onExit: () => void }) {
  const [autoFlip, setAutoFlip] = useState(true);
  const game = useXiangqiGame({});
  const flip = autoFlip && game.turn === 'b';
  const youWin = game.status && game.turn === 'b';
  const turnName = game.turn === 'r' ? 'Red 帥' : 'Black 將';

  return (
    <div className="game-layout">
      <div className="relative">
        <div className="flex items-center gap-3 mb-3.5">
          <span className="pill pill-gold">Pass & play · 友</span>
          <span
            className={`font-extrabold text-[15px] ${
              game.turn === 'r' ? 'text-red-deep' : 'text-black-deep'
            }`}
          >
            {game.status ? 'Game over' : `${turnName} to move`}
          </span>
          {game.checkSide && !game.status && <span className="pill pill-red">Check!</span>}
        </div>
        <XQBoard
          board={game.board}
          cell={52}
          selected={game.selected}
          targets={game.targets}
          lastMove={game.lastMove}
          checkPos={game.checkPos}
          flip={flip}
          onPoint={game.onPoint}
          interactive={!game.status}
        />
        {game.status && (
          <div className="pop game-overlay">
            <div className="card px-8 py-7 text-center">
              <div className="text-[42px]">🏆</div>
              <h2 className="my-1.5 mb-1 text-[26px]">{youWin ? 'Red wins!' : 'Black wins!'}</h2>
              <p className="text-ink-soft font-semibold m-0 mb-4">
                {game.status === 'stalemate' ? 'Stalemate — no legal moves.' : 'Checkmate!'}
              </p>
              <button type="button" className="btn btn-gold" onClick={() => game.reset()}>
                Rematch
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3.5">
        <div className="card p-4">
          <div className="font-extrabold text-[15px] mb-2.5">Room</div>
          <div className="text-[13px] text-ink-soft font-semibold leading-normal mb-3.5">
            You and your friend share this device. The board rotates so the player to move always
            sees their side at the bottom.
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer font-bold text-sm">
            <input
              type="checkbox"
              checked={autoFlip}
              onChange={(e) => setAutoFlip(e.target.checked)}
              className="w-[18px] h-[18px] accent-jade"
            />
            Rotate board each turn
          </label>
        </div>
        <div className="card p-4 flex flex-col gap-2">
          <div className="font-extrabold text-sm text-ink-soft">Moves: {game.history.length}</div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={game.history.length === 0}
            onClick={() => game.undoLast(1)}
          >
            ↶ Take back
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => game.reset()}>
            ↻ Restart
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onExit}>
            ← Leave room
          </button>
        </div>
      </div>
    </div>
  );
}

function OnlineGame({ code, side, onExit }: { code: string; side: Side; onExit: () => void }) {
  const game = useRoomGame(code, side);
  const flip = side === 'b';
  const waitingForOpponent = !game.status && !game.opponentJoined;
  const yourTurn = game.turn === side && !game.status && game.opponentJoined;
  const won = didSideWin(game.status as OnlineRoomStatus, game.winner, side, game.turn, X.opp);
  const opponentName = opponentSeatLabel(side, game.redName, game.blackName);
  const turnLine = game.status
    ? 'Game over'
    : waitingForOpponent
      ? 'Waiting for opponent to join…'
      : yourTurn
        ? 'Your move'
        : `${opponentName} to move`;
  const [confirmResign, setConfirmResign] = useState(false);
  const inProgress = !game.status && game.opponentJoined;
  const inviteLink = inviteLinkForCode(code);
  const showInvitePanel = side === 'r' && !game.opponentJoined;

  return (
    <div className="game-layout">
      <div className="relative">
        <div className="flex items-center gap-3 mb-3.5">
          <span className="pill pill-gold">Online · {code}</span>
          <span
            className={`font-extrabold text-[15px] ${
              waitingForOpponent
                ? 'text-muted'
                : game.turn === 'r'
                  ? 'text-red-deep'
                  : 'text-black-deep'
            }`}
          >
            {turnLine}
          </span>
          {!game.connected && <span className="pill pill-red">Reconnecting…</span>}
          {game.checkSide && !game.status && <span className="pill pill-red">Check!</span>}
        </div>
        <XQBoard
          board={game.board}
          cell={52}
          selected={game.selected}
          targets={game.targets}
          lastMove={game.lastMove}
          checkPos={game.checkPos}
          flip={flip}
          onPoint={game.onPoint}
          interactive={yourTurn}
        />
        {game.status && (
          <div className="pop game-overlay" data-testid="online-game-over">
            <div className="card px-8 py-7 text-center">
              <div className="text-[42px]">{won ? '🏆' : '🎯'}</div>
              <h2 className="my-1.5 mb-1 text-[26px]">{won ? 'You win!' : 'You lose'}</h2>
              <p className="text-ink-soft font-semibold m-0 mb-4">
                {onlineGameOverSubtitle(game.status as OnlineRoomStatus, won, game.winner, {
                  redName: game.redName,
                  blackName: game.blackName,
                })}
              </p>
            </div>
          </div>
        )}
        {confirmResign && (
          <div className="pop game-overlay" data-testid="resign-confirm">
            <div className="card px-8 py-7 text-center max-w-[320px]">
              <h2 className="m-0 mb-1.5 text-[22px]">Resign this game?</h2>
              <p className="text-ink-soft font-semibold m-0 mb-4 text-[14.5px] leading-normal">
                Your opponent will be declared the winner. This cannot be undone.
              </p>
              <div className="flex gap-2.5 justify-center">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmResign(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-red btn-sm"
                  onClick={() => {
                    setConfirmResign(false);
                    game.resign();
                  }}
                >
                  Resign
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3.5">
        <div className="card p-4">
          <div className="font-extrabold text-[15px] mb-2.5">Room {code}</div>
          <RoomSeatRow
            seatSide="r"
            viewerSide={side}
            redName={game.redName}
            blackName={game.blackName}
            joined={true}
            connected={game.redConnected}
          />
          <RoomSeatRow
            seatSide="b"
            viewerSide={side}
            redName={game.redName}
            blackName={game.blackName}
            joined={game.opponentJoined}
            connected={game.blackConnected}
          />
          {game.error && (
            <div className="mt-2 text-red-deep font-bold text-[13px]">{game.error}</div>
          )}
          <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-line-soft">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onExit}>
              ← Leave room
            </button>
            {inProgress && (
              <button
                type="button"
                className="btn btn-red btn-sm"
                data-testid="resign-button"
                onClick={() => setConfirmResign(true)}
              >
                Resign
              </button>
            )}
          </div>
        </div>

        {showInvitePanel && (
          <div className="card p-4 text-center" data-testid="waiting-invite-panel">
            <h3 className="m-0 mb-1 text-[18px] font-extrabold">Invite your friend</h3>
            <p className="text-ink-soft font-semibold text-[13.5px] m-0 mb-4">
              Share this code or link while you wait.
            </p>
            <RoomInviteShare code={code} inviteLink={inviteLink} />
          </div>
        )}
      </div>
    </div>
  );
}

function Lobby({
  onPassPlay,
  onOnline,
}: {
  onPassPlay: () => void;
  onOnline: (code: string, side: Side) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const roomFromUrl = searchParams.get('room');
  const urlJoinCode = roomFromUrl ? roomFromUrl.toUpperCase() : '';
  const [mode, setMode] = useState<'join' | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const activeMode = mode ?? (urlJoinCode ? 'join' : null);
  const joinCodeValue = joinCode || urlJoinCode;
  const [displayName, setDisplayName] = useState(() => getStoredDisplayName());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitDisplayName = () => {
    const apiName = displayNameForApi(displayName);
    saveDisplayNameInput(displayName);
    return apiName;
  };

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiName = submitDisplayName();
      const res = await createRoom(apiName !== undefined ? { displayName: apiName } : undefined);
      // The host waits on the board; the sidebar invite panel shows until Black joins.
      setSearchParams({ room: res.code });
      onOnline(res.code, 'r');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const normalized = joinCodeValue.trim().toUpperCase();
    if (normalized.length < 4) return;
    setLoading(true);
    setError(null);
    try {
      const apiName = submitDisplayName();
      const res = await joinRoom(
        normalized.startsWith('JADE-') ? normalized : `JADE-${normalized}`,
        apiName !== undefined ? { displayName: apiName } : undefined,
      );
      setSearchParams({ room: res.room.code });
      onOnline(res.room.code, res.side);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  if (!activeMode) {
    return (
      <div className="page-container-md">
        <div className="rise section-header mb-9">
          <span className="pill pill-gold mb-3.5">2 players · 友</span>
          <h1 className="section-title">Play with a Friend</h1>
          <p className="section-subtitle">
            Create a private room and share the link, or jump straight into pass-and-play.
          </p>
        </div>
        <DisplayNameField value={displayName} onChange={setDisplayName} />
        <div className="grid grid-cols-2 gap-5">
          <button
            type="button"
            className="card p-0 overflow-hidden text-left cursor-pointer"
            onClick={handleCreate}
            disabled={loading}
          >
            <div className="lobby-card-header bg-gradient-to-br from-[#EBB24B] to-[#C98C1F]">
              <span className="lobby-card-glyph">友</span>
            </div>
            <div className="px-5 pt-[18px] pb-[22px]">
              <div className="font-display font-extrabold text-[21px] mb-1.5">Create a room</div>
              <p className="m-0 text-ink-soft text-[14.5px] font-semibold leading-normal">
                Get a shareable link and invite code to send to your friend.
              </p>
            </div>
          </button>
          <button
            type="button"
            className="card p-0 overflow-hidden text-left cursor-pointer"
            onClick={() => setMode('join')}
          >
            <div className="lobby-card-header bg-gradient-to-br from-[#2BB495] to-[#157A63]">
              <span className="lobby-card-glyph">入</span>
            </div>
            <div className="px-5 pt-[18px] pb-[22px]">
              <div className="font-display font-extrabold text-[21px] mb-1.5">Join with a code</div>
              <p className="m-0 text-ink-soft text-[14.5px] font-semibold leading-normal">
                Got an invite code from a friend? Enter it to sit down at their board.
              </p>
            </div>
          </button>
        </div>
        <div className="text-center mt-[26px]">
          <button type="button" className="btn btn-ghost" onClick={onPassPlay}>
            Pass-and-play on this device →
          </button>
        </div>
        {error && <p className="text-center text-red-deep font-bold mt-4">{error}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-[480px] mx-auto px-[30px] py-[60px]">
      <div className="card p-[30px] text-center">
        <h2 className="text-[26px] m-0 mb-2">Join a room</h2>
        <p className="text-ink-soft font-semibold m-0 mb-5">
          Enter the invite code your friend shared.
        </p>
        <DisplayNameField value={displayName} onChange={setDisplayName} />
        <input
          value={joinCodeValue}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="JADE-XXXX"
          className="room-input"
          aria-label="Invite code"
        />
        <button
          type="button"
          className="btn btn-primary btn-lg w-full"
          disabled={joinCodeValue.length < 4 || loading}
          onClick={handleJoin}
        >
          {loading ? 'Joining…' : 'Join game →'}
        </button>
        {error && <p className="text-red-deep font-bold mt-3">{error}</p>}
        <button
          type="button"
          className="nav-link mt-3.5"
          onClick={() => {
            setMode(null);
            setSearchParams({});
          }}
        >
          ← Back
        </button>
      </div>
    </div>
  );
}

export function MultiplayerScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<'lobby' | 'pass' | 'online'>('lobby');
  const [online, setOnline] = useState<{ code: string; side: Side } | null>(null);
  // Captured once: only the URL the page was opened with triggers a rejoin check,
  // so leaving a room never bounces the player straight back in.
  const [restoreCode] = useState(() => searchParams.get('room')?.toUpperCase() || null);
  const [restoring, setRestoring] = useState(restoreCode !== null);

  const goOnline = useCallback((code: string, side: Side) => {
    setOnline({ code, side });
    setMode('online');
  }, []);

  // --- Rejoin after refresh: a guest already seated in `?room=` returns to the board ---
  useEffect(() => {
    if (!restoreCode) return;
    let cancelled = false;
    getRoom(restoreCode)
      .then(({ room, side }) => {
        if (cancelled) return;
        if (side) goOnline(room.code, side);
        setRestoring(false);
      })
      .catch(() => {
        // Unknown room or network failure: fall through to the join form, which reports errors.
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, [restoreCode, goOnline]);

  if (restoring) {
    return (
      <div className="max-w-[480px] mx-auto px-[30px] py-[60px]">
        <div className="card p-[30px] text-center text-ink-soft font-semibold" role="status">
          Opening room {restoreCode}…
        </div>
      </div>
    );
  }
  if (mode === 'pass') return <PassPlay onExit={() => setMode('lobby')} />;
  if (mode === 'online' && online)
    return (
      <OnlineGame
        code={online.code}
        side={online.side}
        onExit={() => {
          setMode('lobby');
          setOnline(null);
          setSearchParams({});
        }}
      />
    );

  return <Lobby onPassPlay={() => setMode('pass')} onOnline={goOnline} />;
}
