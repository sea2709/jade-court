import { useEffect, useMemo, useState } from 'react';
import { X } from '@jade-court/xiangqi-engine';
import { CoachAvatar } from '../components/CoachAvatar';
import { XQBoard } from '../components/XQBoard';
import { LESSONS, buildBoard, type Lesson } from '../content/lessons';
import { PUZZLES, type Puzzle } from '../content/puzzles';
import { useXiangqiGame } from '../hooks/useXiangqiGame';

function LessonBoard({ lesson }: { lesson: Lesson }) {
  const board = useMemo(() => buildBoard(lesson.pieces), [lesson.key]);
  const [focus, setFocus] = useState<[number, number] | null>(lesson.focus);
  const targets = focus ? X.movesFrom(board, focus[0], focus[1]) : [];

  return (
    <XQBoard
      board={board}
      cell={42}
      selected={focus}
      targets={targets}
      interactive
      onPoint={(r, c) => {
        if (r < 0) return;
        if (board[r]?.[c]) setFocus([r, c]);
      }}
    />
  );
}

function LessonsView() {
  const [active, setActive] = useState(LESSONS[0]!.key);
  const lesson = LESSONS.find((l) => l.key === active)!;

  return (
    <div className="grid grid-cols-[280px_1fr] gap-7 items-start">
      <div className="card p-2.5 flex flex-col gap-0.5">
        {LESSONS.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setActive(l.key)}
            className={`lesson-nav-btn ${active === l.key ? 'lesson-nav-btn-active' : ''}`}
          >
            <span
              className={`lesson-nav-glyph ${
                active === l.key ? 'text-jade-deep' : 'text-ink-soft'
              }`}
            >
              {l.glyph}
            </span>
            <span>
              <span
                className={`block font-display font-extrabold text-[15px] ${
                  active === l.key ? 'text-jade-deep' : 'text-ink'
                }`}
              >
                {l.title}
              </span>
              <span className="block text-xs text-muted font-bold font-piece">{l.zh}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="card p-7 grid grid-cols-[1fr_auto] gap-[30px] items-center">
        <div>
          <span className="pill pill-jade mb-3.5">Lesson · {lesson.zh}</span>
          <h2 className="text-[30px] m-0 mb-3.5">{lesson.title}</h2>
          <p className="text-[16.5px] leading-relaxed text-ink-soft font-semibold m-0 mb-[18px]">
            {lesson.rule}
          </p>
          <div className="flex gap-[11px] items-start bg-cream px-[15px] py-[13px] rounded-[14px]">
            <CoachAvatar size={32} />
            <p className="m-0 text-[14.5px] leading-normal font-bold text-ink">{lesson.tip}</p>
          </div>
          {lesson.focus && (
            <p className="text-[13px] text-muted font-bold mt-4">
              Tap any piece on the board to light up its legal moves.
            </p>
          )}
        </div>
        <LessonBoard lesson={lesson} />
      </div>
    </div>
  );
}

function solutionSet(puzzle: Puzzle) {
  const board = buildBoard(puzzle.pieces);
  const legal = X.legalMoves(board, 'r');
  return legal.filter((m) => {
    const nb = X.applyMove(board, m);
    if (puzzle.kind === 'capture' && puzzle.target)
      return m.to[0] === puzzle.target[0] && m.to[1] === puzzle.target[1];
    if (puzzle.kind === 'check') return X.inCheck(nb, 'b');
    if (puzzle.kind === 'mate') return X.gameStatus(nb, 'b') === 'checkmate';
    return false;
  });
}

function PuzzleView() {
  const [idx, setIdx] = useState(0);
  const puzzle = PUZZLES[idx]!;
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<'win' | 'miss' | null>(null);
  const board = useMemo(() => buildBoard(puzzle.pieces), [puzzle.key, nonce]);
  const solutions = useMemo(() => solutionSet(puzzle), [puzzle.key]);

  const game = useXiangqiGame({
    onMove: (move) => {
      const ok = solutions.some(
        (s) =>
          s.from[0] === move.from[0] &&
          s.from[1] === move.from[1] &&
          s.to[0] === move.to[0] &&
          s.to[1] === move.to[1],
      );
      setResult(ok ? 'win' : 'miss');
      if (!ok) setTimeout(() => setNonce((n) => n + 1), 850);
    },
  });

  useEffect(() => {
    game.reset(board);
    setResult(null);
  }, [puzzle.key, nonce]);

  const yourTurn = !result || result === 'miss';

  return (
    <div className="grid grid-cols-[300px_1fr] gap-7 items-start">
      <div className="flex flex-col gap-3">
        {PUZZLES.map((p, i) => (
          <button
            key={p.key}
            type="button"
            className={`card p-3.5 text-left cursor-pointer outline-[3px] outline-transparent transition-[outline] duration-150 ${
              i === idx ? 'puzzle-card-active' : ''
            }`}
            onClick={() => {
              setIdx(i);
              setNonce((n) => n + 1);
              setResult(null);
            }}
          >
            <div className="flex justify-between items-center mb-1">
              <span className="font-display font-extrabold text-base">
                {i + 1}. {p.title}
              </span>
              <span className="pill pill-gold text-[11px] px-[9px] py-[3px]">{p.diff}</span>
            </div>
            <p className="m-0 text-[13px] text-ink-soft font-semibold leading-snug">{p.brief}</p>
          </button>
        ))}
      </div>
      <div className="card p-[26px] grid grid-cols-[auto_1fr] gap-7 items-center">
        <XQBoard
          board={game.board}
          cell={44}
          selected={game.selected}
          targets={game.targets}
          lastMove={game.lastMove}
          checkPos={game.checkPos}
          onPoint={game.onPoint}
          interactive={yourTurn}
        />
        <div>
          <span className="pill pill-gold mb-3">Puzzle {idx + 1} · {puzzle.diff}</span>
          <h2 className="text-[26px] m-0 mb-2.5">{puzzle.title}</h2>
          <p className="text-base leading-snug text-ink-soft font-semibold m-0 mb-[18px]">
            {puzzle.brief}
          </p>
          {result === 'win' && (
            <div className="pop bg-jade-soft rounded-[14px] px-4 py-3.5 flex gap-[11px] items-center">
              <CoachAvatar size={34} />
              <div>
                <b className="text-jade-deep">Solved! ★</b>
                <div className="text-sm font-semibold text-ink">
                  Beautiful — that's the winning move.
                </div>
              </div>
            </div>
          )}
          {result === 'miss' && (
            <div className="pop bg-red-soft rounded-[14px] px-4 py-3.5 flex gap-[11px] items-center">
              <CoachAvatar size={34} />
              <div>
                <b className="text-red-deep">Not quite.</b>
                <div className="text-sm font-semibold text-ink">
                  Resetting — look again for the key move.
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-2.5 mt-[18px]">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setNonce((n) => n + 1);
                setResult(null);
              }}
            >
              ↻ Reset
            </button>
            {result === 'win' && idx < PUZZLES.length - 1 && (
              <button
                type="button"
                className="btn btn-gold btn-sm"
                onClick={() => {
                  setIdx(idx + 1);
                  setNonce((n) => n + 1);
                  setResult(null);
                }}
              >
                Next puzzle →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LessonsScreen() {
  const [tab, setTab] = useState<'lessons' | 'puzzles'>('lessons');

  return (
    <div className="page-container-xl">
      <div className="flex items-center gap-3.5 mb-6">
        <h1 className="text-[34px] m-0">Learn & Practice</h1>
        <div className="tab-switcher">
          <button
            type="button"
            className={`btn btn-sm ${tab === 'lessons' ? 'btn-primary' : 'bg-transparent text-ink-soft'}`}
            onClick={() => setTab('lessons')}
          >
            Lessons
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'puzzles' ? 'btn-gold' : 'bg-transparent text-ink-soft'}`}
            onClick={() => setTab('puzzles')}
          >
            Puzzles
          </button>
        </div>
      </div>
      {tab === 'lessons' ? <LessonsView /> : <PuzzleView />}
    </div>
  );
}
