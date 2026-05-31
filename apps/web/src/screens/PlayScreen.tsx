import { useState, type Dispatch, type SetStateAction } from 'react';
import { X, type Difficulty, type Side } from '@jade-court/xiangqi-engine';
import { CapturedTray } from '../components/CapturedTray';
import { GameOverCard } from '../components/GameOverCard';
import { XQBoard } from '../components/XQBoard';
import { LEVELS } from '../content/levels';
import { useXiangqiGame } from '../hooks/useXiangqiGame';

function Stars({ n }: { n: number }) {
  return (
    <span style={{ letterSpacing: 2, color: 'var(--gold-deep)' }}>
      {'★'.repeat(n)}
      <span style={{ color: 'var(--line-soft)' }}>{'★'.repeat(3 - n)}</span>
    </span>
  );
}

function Setup({ onStart }: { onStart: (level: Difficulty, side: Side) => void }) {
  const [level, setLevel] = useState<Difficulty>('intermediate');
  const [side, setSide] = useState<Side>('r');

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '50px 30px' }}>
      <div className="rise" style={{ textAlign: 'center', marginBottom: 34 }}>
        <span className="pill pill-red" style={{ marginBottom: 14 }}>
          Compete · 戰
        </span>
        <h1 style={{ fontSize: 40, margin: '0 0 10px' }}>Play vs Computer</h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: 17, fontWeight: 600, margin: 0 }}>
          Pick your challenge. No hints here — just you and the board.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, marginBottom: 30 }}>
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            className="card"
            onClick={() => setLevel(l.id)}
            style={{
              padding: 0,
              overflow: 'hidden',
              textAlign: 'left',
              cursor: 'pointer',
              outline: level === l.id ? '3px solid var(--jade)' : '3px solid transparent',
              transform: level === l.id ? 'translateY(-3px)' : 'none',
              transition: '.16s',
            }}
          >
            <div style={{ height: 92, background: l.accent, display: 'grid', placeItems: 'center' }}>
              <span
                style={{
                  fontFamily: 'var(--font-piece)',
                  fontWeight: 700,
                  fontSize: 56,
                  color: 'rgba(255,255,255,.95)',
                }}
              >
                {l.glyph}
              </span>
            </div>
            <div style={{ padding: '14px 16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19 }}>
                  {l.name}
                </span>
                <Stars n={l.stars} />
              </div>
              <p
                style={{
                  margin: '6px 0 0',
                  color: 'var(--ink-soft)',
                  fontSize: 13.5,
                  fontWeight: 600,
                  lineHeight: 1.45,
                }}
              >
                {l.desc}
              </p>
            </div>
          </button>
        ))}
      </div>
      <div
        className="card"
        style={{
          padding: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 15 }}>Play as</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`btn btn-sm ${side === 'r' ? 'btn-red' : 'btn-ghost'}`}
            onClick={() => setSide('r')}
          >
            Red 帥 (moves first)
          </button>
          <button
            type="button"
            className={`btn btn-sm ${side === 'b' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSide('b')}
            style={side === 'b' ? { background: 'var(--black)', color: '#fff' } : {}}
          >
            Black 將
          </button>
        </div>
        <button
          type="button"
          className="btn btn-red btn-lg"
          style={{ marginLeft: 'auto' }}
          onClick={() => onStart(level, side)}
        >
          Start game →
        </button>
      </div>
    </div>
  );
}

type GameCfg = { level: Difficulty; side: Side };

function Game({
  cfg,
  setCfg,
}: {
  cfg: GameCfg;
  setCfg: Dispatch<SetStateAction<GameCfg | null>>;
}) {
  const { level, side: humanSide } = cfg;
  const aiSide = X.opp(humanSide);
  const game = useXiangqiGame({ aiSide, difficulty: level });
  const flip = humanSide === 'b';
  const yourTurn = game.turn === humanSide && !game.status && !game.revealingOpponentMove;
  const won = game.status && game.turn === aiSide;
  const levelMeta = LEVELS.find((l) => l.id === level)!;

  const statusLine = game.status
    ? 'Game over'
    : game.aiThinking
      ? 'Computer is thinking…'
      : game.revealingOpponentMove && game.lastOpponentMoveText
        ? `Computer played: ${game.lastOpponentMoveText}`
        : yourTurn
          ? 'Your move'
          : 'Waiting…';

  const PlayerStrip = ({
    side,
    label,
    sub,
  }: {
    side: Side;
    label: string;
    sub: string;
  }) => (
    <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-piece)',
          fontWeight: 700,
          fontSize: 22,
          color: '#fff',
          background:
            side === 'r'
              ? 'linear-gradient(150deg,var(--red),var(--red-deep))'
              : 'linear-gradient(150deg,#55504a,var(--black-deep))',
        }}
      >
        {side === 'r' ? '帥' : '將'}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{sub}</div>
      </div>
      <CapturedTray side={side} list={game.captured[side]} />
      {game.turn === side && !game.status && (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--jade)',
            boxShadow: '0 0 0 4px var(--jade-soft)',
          }}
        />
      )}
    </div>
  );

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '24px 30px 50px',
        display: 'grid',
        gridTemplateColumns: 'auto 320px',
        gap: 30,
        alignItems: 'start',
        justifyContent: 'center',
      }}
    >
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <span className="pill pill-red">
            {levelMeta.name} · {levelMeta.zh}
          </span>
          <span
            style={{
              fontWeight: 800,
              color: game.revealingOpponentMove ? 'var(--gold-deep)' : 'var(--ink-soft)',
              fontSize: 14,
              maxWidth: 520,
              lineHeight: 1.35,
            }}
          >
            {statusLine}
          </span>
          {game.checkSide && !game.status && !game.revealingOpponentMove && (
            <span className="pill pill-gold">Check!</span>
          )}
        </div>
        <XQBoard
          board={game.board}
          cell={54}
          selected={game.selected}
          targets={game.targets}
          lastMove={game.lastMove}
          checkPos={game.checkPos}
          opponentLastMove={game.opponentLastMove}
          opponentMoveRevealing={game.revealingOpponentMove}
          flip={flip}
          onPoint={game.onPoint}
          interactive={yourTurn}
        />
        {game.status && (
          <GameOverCard
            status={game.status}
            won={!!won}
            onRematch={() => game.reset()}
            onMenu={() => setCfg(null)}
          />
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <PlayerStrip side={aiSide} label={`Computer · ${levelMeta.name}`} sub="Captured pieces" />
        <PlayerStrip side={humanSide} label="You" sub="Captured pieces" />
        {game.lastOpponentMoveText && (
          <div
            className="card"
            style={{
              padding: '12px 14px',
              fontSize: 13.5,
              fontWeight: 600,
              lineHeight: 1.45,
              color: 'var(--ink-soft)',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
              Computer&apos;s last move
            </div>
            {game.lastOpponentMoveText}
          </div>
        )}
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--muted)', marginBottom: 2 }}>
            Difficulty
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`btn btn-sm ${level === l.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setCfg((c) => c && { ...c, level: l.id })}
              >
                {l.name} {l.zh}
              </button>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink-soft)', marginBottom: 2 }}>
            Moves played: {game.history.length}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={game.history.length < 2 || !yourTurn}
            onClick={() => game.undoLast(2)}
          >
            ↶ Take back move
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => game.reset()}>
            ↻ Restart
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCfg(null)}>
            New game
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlayScreen() {
  const [cfg, setCfg] = useState<GameCfg | null>(null);
  if (!cfg) return <Setup onStart={(level, side) => setCfg({ level, side })} />;
  return <Game cfg={cfg} setCfg={setCfg} />;
}
