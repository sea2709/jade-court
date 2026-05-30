import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X, type Side } from '@jade-court/xiangqi-engine';
import { XQBoard } from '../components/XQBoard';
import { createRoom, joinRoom } from '../lib/api';
import { useRoomGame } from '../hooks/useRoomGame';
import { useXiangqiGame } from '../hooks/useXiangqiGame';

function PassPlay({ onExit }: { onExit: () => void }) {
  const [autoFlip, setAutoFlip] = useState(true);
  const game = useXiangqiGame({});
  const flip = autoFlip && game.turn === 'b';
  const youWin = game.status && game.turn === 'b';
  const turnName = game.turn === 'r' ? 'Red 帥' : 'Black 將';

  return (
    <div
      style={{
        maxWidth: 1040,
        margin: '0 auto',
        padding: '24px 30px 50px',
        display: 'grid',
        gridTemplateColumns: 'auto 300px',
        gap: 30,
        alignItems: 'start',
        justifyContent: 'center',
      }}
    >
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span className="pill pill-gold">Pass & play · 友</span>
          <span
            style={{
              fontWeight: 800,
              color: game.turn === 'r' ? 'var(--red-deep)' : 'var(--black-deep)',
              fontSize: 15,
            }}
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
          <div
            className="pop"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(43,38,34,.45)',
              borderRadius: 14,
              zIndex: 20,
            }}
          >
            <div className="card" style={{ padding: '28px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 42 }}>🏆</div>
              <h2 style={{ margin: '6px 0 4px', fontSize: 26 }}>{youWin ? 'Red wins!' : 'Black wins!'}</h2>
              <p style={{ color: 'var(--ink-soft)', fontWeight: 600, margin: '0 0 16px' }}>
                {game.status === 'stalemate'
                  ? 'Stalemate — no legal moves.'
                  : 'Checkmate!'}
              </p>
              <button type="button" className="btn btn-gold" onClick={() => game.reset()}>
                Rematch
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Room</div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--ink-soft)',
              fontWeight: 600,
              lineHeight: 1.5,
              marginBottom: 14,
            }}
          >
            You and your friend share this device. The board rotates so the player to move always
            sees their side at the bottom.
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            <input
              type="checkbox"
              checked={autoFlip}
              onChange={(e) => setAutoFlip(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--jade)' }}
            />
            Rotate board each turn
          </label>
        </div>
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink-soft)' }}>
            Moves: {game.history.length}
          </div>
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

function OnlineGame({
  code,
  side,
  onExit,
}: {
  code: string;
  side: Side;
  onExit: () => void;
}) {
  const game = useRoomGame(code, side);
  const flip = side === 'b';
  const yourTurn = game.turn === side && !game.status;
  const won = game.status && game.turn === X.opp(side);
  const turnName = game.turn === 'r' ? 'Red 帥' : 'Black 將';

  return (
    <div
      style={{
        maxWidth: 1040,
        margin: '0 auto',
        padding: '24px 30px 50px',
        display: 'grid',
        gridTemplateColumns: 'auto 300px',
        gap: 30,
        alignItems: 'start',
        justifyContent: 'center',
      }}
    >
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span className="pill pill-gold">Online · {code}</span>
          <span
            style={{
              fontWeight: 800,
              color: game.turn === 'r' ? 'var(--red-deep)' : 'var(--black-deep)',
              fontSize: 15,
            }}
          >
            {game.status ? 'Game over' : yourTurn ? 'Your move' : `${turnName} to move`}
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
          <div
            className="pop"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(43,38,34,.45)',
              borderRadius: 14,
              zIndex: 20,
            }}
          >
            <div className="card" style={{ padding: '28px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 42 }}>🏆</div>
              <h2 style={{ margin: '6px 0 4px', fontSize: 26 }}>{won ? 'You win!' : 'You lose'}</h2>
              <p style={{ color: 'var(--ink-soft)', fontWeight: 600, margin: '0 0 16px' }}>
                {game.status === 'stalemate' ? 'Stalemate.' : 'Checkmate!'}
              </p>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Room {code}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600, lineHeight: 1.5 }}>
            You are playing as {side === 'r' ? 'Red 帥' : 'Black 將'}.
            {!game.opponentJoined && (
              <div style={{ marginTop: 8, color: 'var(--muted)' }}>Waiting for opponent…</div>
            )}
            {game.opponentJoined && (
              <div style={{ marginTop: 8, color: 'var(--jade-deep)' }}>Opponent connected ✓</div>
            )}
            {game.error && (
              <div style={{ marginTop: 8, color: 'var(--red-deep)' }}>{game.error}</div>
            )}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onExit}>
            ← Leave room
          </button>
        </div>
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
  const [mode, setMode] = useState<'create' | 'join' | null>(null);
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState(searchParams.get('room') ?? '');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opponentJoined, setOpponentJoined] = useState(false);

  const link = code
    ? `${location.origin}/multiplayer?room=${encodeURIComponent(code)}`
    : '';

  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam && !mode) {
      setJoinCode(roomParam.toUpperCase());
      setMode('join');
    }
  }, [searchParams, mode]);

  useEffect(() => {
    if (mode !== 'create' || !code) return;
    const ws = new WebSocket(
      import.meta.env.VITE_WS_URL ??
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
    );
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          code,
          guestId: localStorage.getItem('jade-court-guest-id'),
        }),
      );
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as { type: string; room?: { blackJoined?: boolean } };
      if (msg.type === 'room' && msg.room?.blackJoined) setOpponentJoined(true);
    };
    return () => ws.close();
  }, [mode, code]);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await createRoom();
      setCode(res.code);
      setMode('create');
      setSearchParams({ room: res.code });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const normalized = joinCode.trim().toUpperCase();
    if (normalized.length < 4) return;
    setLoading(true);
    setError(null);
    try {
      const res = await joinRoom(normalized.startsWith('JADE-') ? normalized : `JADE-${normalized}`);
      setSearchParams({ room: res.room.code });
      onOnline(res.room.code, res.side);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  if (!mode) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '50px 30px' }}>
        <div className="rise" style={{ textAlign: 'center', marginBottom: 36 }}>
          <span className="pill pill-gold" style={{ marginBottom: 14 }}>
            2 players · 友
          </span>
          <h1 style={{ fontSize: 40, margin: '0 0 10px' }}>Play with a Friend</h1>
          <p style={{ color: 'var(--ink-soft)', fontSize: 17, fontWeight: 600, margin: 0 }}>
            Create a private room and share the link, or jump straight into pass-and-play.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <button
            type="button"
            className="card"
            onClick={handleCreate}
            disabled={loading}
            style={{ padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer' }}
          >
            <div
              style={{
                height: 110,
                background: 'linear-gradient(150deg,#EBB24B,#C98C1F)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-piece)',
                  fontSize: 64,
                  color: 'rgba(255,255,255,.95)',
                  fontWeight: 700,
                }}
              >
                友
              </span>
            </div>
            <div style={{ padding: '18px 20px 22px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21, marginBottom: 6 }}>
                Create a room
              </div>
              <p
                style={{
                  margin: 0,
                  color: 'var(--ink-soft)',
                  fontSize: 14.5,
                  fontWeight: 600,
                  lineHeight: 1.5,
                }}
              >
                Get a shareable link and invite code to send to your friend.
              </p>
            </div>
          </button>
          <button
            type="button"
            className="card"
            onClick={() => setMode('join')}
            style={{ padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer' }}
          >
            <div
              style={{
                height: 110,
                background: 'linear-gradient(150deg,#2BB495,#157A63)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-piece)',
                  fontSize: 64,
                  color: 'rgba(255,255,255,.95)',
                  fontWeight: 700,
                }}
              >
                入
              </span>
            </div>
            <div style={{ padding: '18px 20px 22px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21, marginBottom: 6 }}>
                Join with a code
              </div>
              <p
                style={{
                  margin: 0,
                  color: 'var(--ink-soft)',
                  fontSize: 14.5,
                  fontWeight: 600,
                  lineHeight: 1.5,
                }}
              >
                Got an invite code from a friend? Enter it to sit down at their board.
              </p>
            </div>
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 26 }}>
          <button type="button" className="btn btn-ghost" onClick={onPassPlay}>
            Pass-and-play on this device →
          </button>
        </div>
        {error && (
          <p style={{ textAlign: 'center', color: 'var(--red-deep)', fontWeight: 700, marginTop: 16 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  if (mode === 'join') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 30px' }}>
        <div className="card" style={{ padding: 30, textAlign: 'center' }}>
          <h2 style={{ fontSize: 26, margin: '0 0 8px' }}>Join a room</h2>
          <p style={{ color: 'var(--ink-soft)', fontWeight: 600, margin: '0 0 20px' }}>
            Enter the invite code your friend shared.
          </p>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="JADE-XXXX"
            style={{
              width: '100%',
              textAlign: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 24,
              letterSpacing: 2,
              padding: '14px',
              borderRadius: 14,
              border: '2px solid var(--line-soft)',
              background: 'var(--cream)',
              color: 'var(--ink)',
              marginBottom: 18,
            }}
          />
          <button
            type="button"
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            disabled={joinCode.length < 4 || loading}
            onClick={handleJoin}
          >
            {loading ? 'Joining…' : 'Join game →'}
          </button>
          {error && (
            <p style={{ color: 'var(--red-deep)', fontWeight: 700, marginTop: 12 }}>{error}</p>
          )}
          <button type="button" className="nav-link" style={{ marginTop: 14 }} onClick={() => setMode(null)}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  const codeSuffix = code.replace('JADE-', '');

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '50px 30px' }}>
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <span className="pill pill-gold" style={{ marginBottom: 16 }}>
          Room ready
        </span>
        <h2 style={{ fontSize: 28, margin: '0 0 6px' }}>Invite your friend</h2>
        <p style={{ color: 'var(--ink-soft)', fontWeight: 600, margin: '0 0 22px' }}>
          Share this code or link. They join, you play.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 18 }}>
          {codeSuffix.split('').map((ch, i) => (
            <span
              key={i}
              style={{
                width: 52,
                height: 62,
                borderRadius: 14,
                display: 'grid',
                placeItems: 'center',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 30,
                background: 'var(--cream)',
                border: '2px solid var(--line-soft)',
                color: 'var(--ink)',
              }}
            >
              {ch}
            </span>
          ))}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            color: 'var(--muted)',
            letterSpacing: 3,
            marginBottom: 20,
          }}
        >
          {code}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          <input
            readOnly
            value={link}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              padding: '11px 13px',
              borderRadius: 10,
              border: '1px solid var(--line-soft)',
              background: 'var(--cream)',
              color: 'var(--ink-soft)',
            }}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(link)}>
            {copied ? '✓ Copied' : 'Copy link'}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '12px',
            borderRadius: 14,
            background: opponentJoined ? 'var(--jade-soft)' : 'var(--cream)',
            marginBottom: 20,
          }}
        >
          {!opponentJoined ? (
            <span style={{ fontWeight: 700, color: 'var(--muted)', fontSize: 14 }}>
              Waiting for opponent to join…
            </span>
          ) : (
            <span style={{ fontWeight: 800, color: 'var(--jade-deep)', fontSize: 15 }}>
              ✓ Opponent joined the room!
            </span>
          )}
        </div>

        <button
          type="button"
          className="btn btn-gold btn-lg"
          style={{ width: '100%' }}
          onClick={() => onOnline(code, 'r')}
        >
          {opponentJoined ? 'Start game →' : 'Start game (waiting for opponent)'}
        </button>
        <button type="button" className="nav-link" style={{ marginTop: 14 }} onClick={() => setMode(null)}>
          ← Back
        </button>
      </div>
    </div>
  );
}

export function MultiplayerScreen() {
  const [mode, setMode] = useState<'lobby' | 'pass' | 'online'>('lobby');
  const [online, setOnline] = useState<{ code: string; side: Side } | null>(null);

  if (mode === 'pass') return <PassPlay onExit={() => setMode('lobby')} />;
  if (mode === 'online' && online)
    return (
      <OnlineGame
        code={online.code}
        side={online.side}
        onExit={() => {
          setMode('lobby');
          setOnline(null);
        }}
      />
    );

  return (
    <Lobby
      onPassPlay={() => setMode('pass')}
      onOnline={(code, side) => {
        setOnline({ code, side });
        setMode('online');
      }}
    />
  );
}
