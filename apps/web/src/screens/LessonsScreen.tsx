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
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 28, alignItems: 'start' }}>
      <div className="card" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {LESSONS.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setActive(l.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 12,
              background: active === l.key ? 'var(--jade-soft)' : 'transparent',
              textAlign: 'left',
              transition: '.14s',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                flex: '0 0 auto',
                display: 'grid',
                placeItems: 'center',
                fontFamily: 'var(--font-piece)',
                fontWeight: 700,
                fontSize: 19,
                background: '#fff',
                color: active === l.key ? 'var(--jade-deep)' : 'var(--ink-soft)',
                border: '1px solid var(--line-soft)',
              }}
            >
              {l.glyph}
            </span>
            <span>
              <span
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 15,
                  color: active === l.key ? 'var(--jade-deep)' : 'var(--ink)',
                }}
              >
                {l.title}
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--muted)',
                  fontWeight: 700,
                  fontFamily: 'var(--font-piece)',
                }}
              >
                {l.zh}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div
        className="card"
        style={{
          padding: 28,
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 30,
          alignItems: 'center',
        }}
      >
        <div>
          <span className="pill pill-jade" style={{ marginBottom: 14 }}>
            Lesson · {lesson.zh}
          </span>
          <h2 style={{ fontSize: 30, margin: '0 0 14px' }}>{lesson.title}</h2>
          <p
            style={{
              fontSize: 16.5,
              lineHeight: 1.6,
              color: 'var(--ink-soft)',
              fontWeight: 600,
              margin: '0 0 18px',
            }}
          >
            {lesson.rule}
          </p>
          <div
            style={{
              display: 'flex',
              gap: 11,
              alignItems: 'flex-start',
              background: 'var(--cream)',
              padding: '13px 15px',
              borderRadius: 14,
            }}
          >
            <CoachAvatar size={32} />
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, fontWeight: 700, color: 'var(--ink)' }}>
              {lesson.tip}
            </p>
          </div>
          {lesson.focus && (
            <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700, marginTop: 16 }}>
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
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 28, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {PUZZLES.map((p, i) => (
          <button
            key={p.key}
            type="button"
            className="card"
            onClick={() => {
              setIdx(i);
              setNonce((n) => n + 1);
              setResult(null);
            }}
            style={{
              padding: 14,
              textAlign: 'left',
              cursor: 'pointer',
              outline: i === idx ? '3px solid var(--gold)' : '3px solid transparent',
              transition: '.14s',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16 }}>
                {i + 1}. {p.title}
              </span>
              <span className="pill pill-gold" style={{ fontSize: 11, padding: '3px 9px' }}>
                {p.diff}
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: 'var(--ink-soft)',
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              {p.brief}
            </p>
          </button>
        ))}
      </div>
      <div
        className="card"
        style={{
          padding: 26,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: 28,
          alignItems: 'center',
        }}
      >
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
          <span className="pill pill-gold" style={{ marginBottom: 12 }}>
            Puzzle {idx + 1} · {puzzle.diff}
          </span>
          <h2 style={{ fontSize: 26, margin: '0 0 10px' }}>{puzzle.title}</h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.55,
              color: 'var(--ink-soft)',
              fontWeight: 600,
              margin: '0 0 18px',
            }}
          >
            {puzzle.brief}
          </p>
          {result === 'win' && (
            <div
              className="pop"
              style={{
                background: 'var(--jade-soft)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                gap: 11,
                alignItems: 'center',
              }}
            >
              <CoachAvatar size={34} />
              <div>
                <b style={{ color: 'var(--jade-deep)' }}>Solved! ★</b>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                  Beautiful — that's the winning move.
                </div>
              </div>
            </div>
          )}
          {result === 'miss' && (
            <div
              className="pop"
              style={{
                background: 'var(--red-soft)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                gap: 11,
                alignItems: 'center',
              }}
            >
              <CoachAvatar size={34} />
              <div>
                <b style={{ color: 'var(--red-deep)' }}>Not quite.</b>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                  Resetting — look again for the key move.
                </div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
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
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '30px 30px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <h1 style={{ fontSize: 34, margin: 0 }}>Learn & Practice</h1>
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: 6,
            background: '#fff',
            padding: 5,
            borderRadius: 999,
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--line-soft)',
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${tab === 'lessons' ? 'btn-primary' : ''}`}
            style={tab !== 'lessons' ? { background: 'transparent', color: 'var(--ink-soft)' } : {}}
            onClick={() => setTab('lessons')}
          >
            Lessons
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'puzzles' ? 'btn-gold' : ''}`}
            style={tab !== 'puzzles' ? { background: 'transparent', color: 'var(--ink-soft)' } : {}}
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
