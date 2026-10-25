import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  X,
  type Difficulty,
  type GameStatus,
  type PieceType,
  type Side,
} from '@jade-court/xiangqi-engine';
import { CapturedTray } from '../components/CapturedTray';
import { ConfirmNewGameDialog } from '../components/ConfirmNewGameDialog';
import { ContinueSavedGameCard, SignInToSaveGamesNote } from '../components/ContinueSavedGameCard';
import { GameOverCard } from '../components/GameOverCard';
import { SavedGameAlertBanner } from '../components/SavedGameAlertBanner';
import { XQBoard } from '../components/XQBoard';
import { LEVELS } from '../content/levels';
import { useSavedGame, type UseSavedGameResult } from '../hooks/useSavedGame';
import { useXiangqiGame, type InitialMovePlies } from '../hooks/useXiangqiGame';
import type { PvcGameConfig } from '../lib/gamesApi';

function Stars({ n }: { n: number }) {
  return (
    <span className="tracking-[2px] text-gold-deep">
      {'★'.repeat(n)}
      <span className="text-line-soft">{'★'.repeat(3 - n)}</span>
    </span>
  );
}

function Setup({
  saved,
  onStart,
  onContinue,
  pendingStart,
  onConfirmNew,
  onCancelNew,
}: {
  saved: UseSavedGameResult;
  onStart: (level: Difficulty, side: Side) => void;
  onContinue: () => void;
  pendingStart: { level: Difficulty; side: Side } | null;
  onConfirmNew: () => void;
  onCancelNew: () => void;
}) {
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
      {!saved.signedIn ? <SignInToSaveGamesNote /> : null}
      {saved.signedIn && saved.save && !saved.loading ? (
        <ContinueSavedGameCard
          save={saved.save}
          onContinue={onContinue}
          onAbandon={() => void saved.abandon()}
          abandonBusy={saved.abandonBusy}
        />
      ) : null}
      <div className="grid grid-cols-3 gap-[18px] mb-[30px]">
        {LEVELS.map((l) => {
          const selected = level === l.id;
          return (
            <button
              key={l.id}
              type="button"
              aria-pressed={selected}
              className={`level-card card card-interactive p-0 overflow-hidden text-left ${
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
                  <span className="card-title-link font-display font-extrabold text-[19px]">
                    {l.name}
                  </span>
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
      {pendingStart ? (
        <ConfirmNewGameDialog onConfirm={onConfirmNew} onCancel={onCancelNew} />
      ) : null}
    </div>
  );
}

type GameCfg = { level: Difficulty; side: Side };

function PlayerStrip({
  side,
  label,
  sub,
  captured,
  turn,
  status,
}: {
  side: Side;
  label: string;
  sub: string;
  captured: PieceType[];
  turn: Side;
  status: GameStatus;
}) {
  return (
    <div className="card px-4 py-3 flex items-center gap-3">
      <span className={`player-badge ${side === 'r' ? 'player-badge-red' : 'player-badge-black'}`}>
        {side === 'r' ? '帥' : '將'}
      </span>
      <div className="flex-1">
        <div className="font-display font-extrabold text-[15px]">{label}</div>
        <div className="text-xs text-muted font-bold">{sub}</div>
      </div>
      <CapturedTray side={side} list={captured} />
      {turn === side && !status && <span className="turn-indicator" />}
    </div>
  );
}

function Game({
  cfg,
  setCfg,
  initialMoves,
  saved,
  onReloadSave,
}: {
  cfg: GameCfg;
  setCfg: Dispatch<SetStateAction<GameCfg | null>>;
  initialMoves?: InitialMovePlies;
  saved: UseSavedGameResult;
  onReloadSave: () => void;
}) {
  const { level, side: humanSide } = cfg;
  const aiSide = X.opp(humanSide);
  const game = useXiangqiGame({
    aiSide,
    difficulty: level,
    aiProvider: 'server',
    revealOpponentMoveMs: 0,
    initialMoves,
  });
  const flip = humanSide === 'b';
  const yourTurn = game.turn === humanSide && !game.status;
  const won = game.status && game.turn === aiSide;
  const levelMeta = LEVELS.find((l) => l.id === level)!;
  const lastPly = game.history.length > 0 ? game.history[game.history.length - 1] : null;
  const humanLastMove = lastPly?.side === humanSide && game.lastMove ? game.lastMove : null;

  const statusLine = game.status
    ? 'Game over'
    : game.aiThinking
      ? 'Computer is thinking…'
      : yourTurn
        ? 'Your move'
        : 'Waiting…';

  const canUndo = game.history.length >= 2 && yourTurn && !game.aiThinking;
  const canRedo = game.redoCount >= 2 && yourTurn && !game.aiThinking;

  const undoTitle = 'Take back your last move (Ctrl+Z)';
  const redoTitle = !canRedo
    ? game.redoCount < 2
      ? 'Nothing to redo'
      : 'Wait for the computer to move'
    : 'Redo the moves you took back (Ctrl+Shift+Z)';

  useEffect(() => {
    if (!saved.signedIn) return;
    const settled = !game.aiThinking && !game.revealingOpponentMove;
    const pvcConfig: PvcGameConfig = { level, side: humanSide };
    const moves = game.history.map((h) => ({
      from: h.move.from as [number, number],
      to: h.move.to as [number, number],
    }));
    saved.scheduleAutosave({ config: pvcConfig, moves }, { enabled: settled });
  }, [
    saved,
    saved.signedIn,
    level,
    humanSide,
    game.history,
    game.aiThinking,
    game.revealingOpponentMove,
    game.status,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
          return;
        }
      }
      const key = e.key.toLowerCase();
      const isZ = key === 'z';
      const isY = key === 'y';
      if (!isZ && !isY) return;
      if ((isZ && e.shiftKey) || (isY && e.ctrlKey)) {
        if (!canRedo) return;
        e.preventDefault();
        game.redoLast(2);
        return;
      }
      if (isZ && !e.shiftKey) {
        if (!canUndo) return;
        e.preventDefault();
        game.undoLast(2);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canUndo, canRedo, game]);

  const leaveToSetup = () => {
    void saved.flushAutosave();
    setCfg(null);
  };

  return (
    <div className="game-layout-wide">
      <div className="relative">
        <SavedGameAlertBanner
          staleRevisionError={saved.staleRevisionError}
          saveError={saved.saveError}
          onReloadSave={onReloadSave}
        />
        <div className="flex items-center gap-3 mb-3.5 flex-wrap">
          <span className="pill pill-red">
            {levelMeta.name} · {levelMeta.zh}
          </span>
          <span className="font-extrabold text-sm max-w-[520px] leading-snug text-ink-soft">
            {statusLine}
          </span>
          {game.checkSide && !game.status && <span className="pill pill-gold">Check!</span>}
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
            onMenu={leaveToSetup}
          />
        )}
      </div>

      <div className="flex flex-col gap-3.5">
        <PlayerStrip
          side={aiSide}
          label={`Computer · ${levelMeta.name}`}
          sub="Captured pieces"
          captured={game.captured[aiSide]}
          turn={game.turn}
          status={game.status}
        />
        <PlayerStrip
          side={humanSide}
          label="You"
          sub="Captured pieces"
          captured={game.captured[humanSide]}
          turn={game.turn}
          status={game.status}
        />
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
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm flex-1 px-2"
              disabled={game.history.length < 2 || !yourTurn}
              aria-label="Take back move"
              title={undoTitle}
              onClick={() => game.undoLast(2)}
            >
              ↶ Take back move
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm flex-1 px-2"
              disabled={game.redoCount < 2 || !yourTurn || game.aiThinking}
              aria-label="Redo move"
              title={redoTitle}
              onClick={() => game.redoLast(2)}
            >
              ↷ Redo move
            </button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => game.reset()}>
            ↻ Restart
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={leaveToSetup}>
            New game
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlayScreen() {
  const saved = useSavedGame('pvc');
  const [cfg, setCfg] = useState<GameCfg | null>(null);
  const [initialMoves, setInitialMoves] = useState<InitialMovePlies | undefined>(undefined);
  const [gameSessionKey, setGameSessionKey] = useState(0);
  const [pendingStart, setPendingStart] = useState<{ level: Difficulty; side: Side } | null>(null);

  const tryStart = (level: Difficulty, side: Side) => {
    if (saved.save) {
      setPendingStart({ level, side });
      return;
    }
    setInitialMoves(undefined);
    setCfg({ level, side });
  };

  const confirmNewGame = async () => {
    if (pendingStart) {
      await saved.abandon();
      setInitialMoves(undefined);
      setCfg(pendingStart);
      setPendingStart(null);
    }
  };

  const onContinue = () => {
    if (!saved.save) return;
    const c = saved.save.config as PvcGameConfig;
    setInitialMoves(saved.save.moves);
    setCfg({ level: c.level, side: c.side });
    setGameSessionKey((k) => k + 1);
  };

  const reloadGameFromServer = async () => {
    const loaded = await saved.reloadFromServer();
    if (!loaded) return;
    const c = loaded.config as PvcGameConfig;
    setInitialMoves(loaded.moves);
    setCfg({ level: c.level, side: c.side });
    setGameSessionKey((k) => k + 1);
  };

  if (!cfg) {
    return (
      <Setup
        saved={saved}
        onStart={tryStart}
        onContinue={onContinue}
        pendingStart={pendingStart}
        onConfirmNew={() => void confirmNewGame()}
        onCancelNew={() => setPendingStart(null)}
      />
    );
  }
  return (
    <Game
      key={gameSessionKey}
      cfg={cfg}
      setCfg={setCfg}
      initialMoves={initialMoves}
      saved={saved}
      onReloadSave={() => void reloadGameFromServer()}
    />
  );
}
