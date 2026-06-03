import { useState, type Dispatch, type SetStateAction } from 'react';
import { X, type Difficulty, type Side } from '@jade-court/xiangqi-engine';
import { CapturedTray } from '../components/CapturedTray';
import { GameOverCard } from '../components/GameOverCard';
import { XQBoard } from '../components/XQBoard';
import { LEVELS } from '../content/levels';
import { useXiangqiGame } from '../hooks/useXiangqiGame';

function Stars({ n }: { n: number }) {
  return (
    <span className="tracking-[2px] text-gold-deep">
      {'★'.repeat(n)}
      <span className="text-line-soft">{'★'.repeat(3 - n)}</span>
    </span>
  );
}

function Setup({ onStart }: { onStart: (level: Difficulty, side: Side) => void }) {
  const [level, setLevel] = useState<Difficulty>('intermediate');
  const [side, setSide] = useState<Side>('r');

  return (
    <div className="page-container-sm">
      <div className="rise section-header">
        <span className="pill pill-red mb-3.5">Compete · 戰</span>
        <h1 className="section-title">Play vs Computer</h1>
        <p className="section-subtitle">
          Pick your challenge. No hints here — just you and the board.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-[18px] mb-[30px]">
        {LEVELS.map((l) => {
          const selected = level === l.id;
          return (
            <button
              key={l.id}
              type="button"
              aria-pressed={selected}
              className={`level-card card p-0 overflow-hidden text-left cursor-pointer outline-[4px] outline-transparent ${
                selected ? 'level-card-active' : ''
              }`}
              onClick={() => setLevel(l.id)}
            >
              {selected && (
                <span className="level-card-selected-badge pill pill-jade">Selected</span>
              )}
              <div className="mode-card-header" style={{ background: l.accent }}>
                <span className="mode-card-glyph">{l.glyph}</span>
              </div>
              <div className="level-card-body px-4 pt-3.5 pb-[18px]">
                <div className="flex justify-between items-center">
                  <span className="font-display font-extrabold text-[19px]">{l.name}</span>
                  <Stars n={l.stars} />
                </div>
                <p className="mt-1.5 mb-0 text-ink-soft text-[13.5px] font-semibold leading-snug">
                  {l.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      <div className="card p-5 flex items-center gap-[18px] justify-center flex-wrap">
        <span className="font-extrabold text-[15px]">Play as</span>
        <div className="flex gap-2">
          <button
            type="button"
            className={`btn btn-sm ${side === 'r' ? 'btn-red' : 'btn-ghost'}`}
            onClick={() => setSide('r')}
          >
            Red 帥 (moves first)
          </button>
          <button
            type="button"
            className={`btn btn-sm ${side === 'b' ? 'btn-primary' : 'btn-ghost'} ${
              side === 'b' ? '!bg-black !text-white' : ''
            }`}
            onClick={() => setSide('b')}
          >
            Black 將
          </button>
        </div>
        <button
          type="button"
          className="btn btn-red btn-lg ml-auto"
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
  const game = useXiangqiGame({
    aiSide,
    difficulty: level,
    aiProvider: 'server',
    revealOpponentMoveMs: 0,
  });
  const flip = humanSide === 'b';
  const yourTurn = game.turn === humanSide && !game.status;
  const won = game.status && game.turn === aiSide;
  const levelMeta = LEVELS.find((l) => l.id === level)!;
  const lastPly = game.history.length > 0 ? game.history[game.history.length - 1] : null;
  const humanLastMove =
    lastPly?.side === humanSide && game.lastMove ? game.lastMove : null;

  const statusLine = game.status
    ? 'Game over'
    : game.aiThinking
      ? 'Computer is thinking…'
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
    <div className="card px-4 py-3 flex items-center gap-3">
      <span className={`player-badge ${side === 'r' ? 'player-badge-red' : 'player-badge-black'}`}>
        {side === 'r' ? '帥' : '將'}
      </span>
      <div className="flex-1">
        <div className="font-display font-extrabold text-[15px]">{label}</div>
        <div className="text-xs text-muted font-bold">{sub}</div>
      </div>
      <CapturedTray side={side} list={game.captured[side]} />
      {game.turn === side && !game.status && <span className="turn-indicator" />}
    </div>
  );

  return (
    <div className="game-layout-wide">
      <div className="relative">
        <div className="flex items-center gap-3 mb-3.5 flex-wrap">
          <span className="pill pill-red">
            {levelMeta.name} · {levelMeta.zh}
          </span>
          <span className="font-extrabold text-sm max-w-[520px] leading-snug text-ink-soft">
            {statusLine}
          </span>
          {game.checkSide && !game.status && (
            <span className="pill pill-gold">Check!</span>
          )}
        </div>
        <XQBoard
          board={game.board}
          cell={54}
          selected={game.selected}
          targets={game.targets}
          lastMove={humanLastMove}
          computerLastMove={game.computerLastMove}
          checkPos={game.checkPos}
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

      <div className="flex flex-col gap-3.5">
        <PlayerStrip side={aiSide} label={`Computer · ${levelMeta.name}`} sub="Captured pieces" />
        <PlayerStrip side={humanSide} label="You" sub="Captured pieces" />
        {game.lastOpponentMoveText && (
          <div className="card px-3.5 py-3 text-[13.5px] font-semibold leading-snug text-ink-soft">
            <div className="font-extrabold text-xs text-muted mb-1">Computer&apos;s last move</div>
            {game.lastOpponentMoveText}
          </div>
        )}
        <div className="card p-4 flex flex-col gap-2">
          <div className="font-extrabold text-[13px] text-muted mb-0.5">Difficulty</div>
          <div className="flex flex-col gap-1.5">
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
        <div className="card p-4 flex flex-col gap-2">
          <div className="font-extrabold text-sm text-ink-soft mb-0.5">
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
