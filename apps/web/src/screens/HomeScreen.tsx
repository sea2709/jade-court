import { useNavigate } from 'react-router-dom';
import { X } from '@jade-court/xiangqi-engine';
import { CoachAvatar } from '../components/CoachAvatar';
import { XQBoard } from '../components/XQBoard';

function ModeCard({
  tag,
  tagClass,
  title,
  zh,
  desc,
  cta,
  ctaClass,
  onClick,
  accent,
  glyph,
}: {
  tag: string;
  tagClass: string;
  title: string;
  zh: string;
  desc: string;
  cta: string;
  ctaClass: string;
  onClick: () => void;
  accent: string;
  glyph: string;
}) {
  return (
    <button
      type="button"
      className="card rise"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--paper)',
      }}
    >
      <div
        style={{
          height: 132,
          position: 'relative',
          display: 'grid',
          placeItems: 'center',
          background: accent,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-piece)',
            fontWeight: 700,
            fontSize: 92,
            color: 'rgba(255,255,255,.92)',
            textShadow: '0 4px 10px rgba(0,0,0,.18)',
          }}
        >
          {glyph}
        </span>
      </div>
      <div style={{ padding: '20px 22px 24px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <span className={`pill ${tagClass}`} style={{ alignSelf: 'flex-start' }}>
          {tag}
        </span>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 23, lineHeight: 1.1 }}>
            {title}{' '}
            <span
              style={{
                color: 'var(--muted)',
                fontFamily: 'var(--font-piece)',
                fontWeight: 700,
                fontSize: 19,
              }}
            >
              {zh}
            </span>
          </div>
          <p
            style={{
              margin: '8px 0 0',
              color: 'var(--ink-soft)',
              fontSize: 15,
              lineHeight: 1.5,
              fontWeight: 600,
            }}
          >
            {desc}
          </p>
        </div>
        <span className={`btn ${ctaClass}`} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
          {cta}
        </span>
      </div>
    </button>
  );
}

export function HomeScreen() {
  const navigate = useNavigate();
  const go = (path: string) => {
    navigate(path);
    window.scrollTo({ top: 0 });
  };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 30px 70px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.05fr .95fr',
          gap: 44,
          alignItems: 'center',
          marginBottom: 54,
        }}
      >
        <div className="rise">
          <span className="pill pill-gold" style={{ marginBottom: 18 }}>
            象棋 · Learn the game of generals
          </span>
          <h1 style={{ fontSize: 56, lineHeight: 1.02, margin: '0 0 18px', letterSpacing: '-.02em' }}>
            Master <span style={{ color: 'var(--red-deep)' }}>Xiangqi</span>,<br />
            one friendly move at a time.
          </h1>
          <p
            style={{
              fontSize: 19,
              lineHeight: 1.55,
              color: 'var(--ink-soft)',
              fontWeight: 600,
              maxWidth: 520,
              margin: '0 0 28px',
            }}
          >
            A patient coach who shows you every legal move, explains the why behind it, and plays at
            your level — from your very first game to beating a friend across the river.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => go('/learn')}>
              Start learning →
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={() => go('/play')}>
              Play vs computer
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 26,
              color: 'var(--ink-soft)',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            <CoachAvatar size={42} />
            <span>
              Guided by <b>Master Lin</b> — your in-game tutor.
            </span>
          </div>
        </div>
        <div className="pop" style={{ display: 'grid', placeItems: 'center' }}>
          <XQBoard board={X.initialBoard()} cell={42} interactive={false} />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 18,
        }}
      >
        <h2 style={{ fontSize: 26, margin: 0 }}>Choose how you want to play</h2>
        <button type="button" className="nav-link" onClick={() => go('/lessons')} style={{ fontSize: 15 }}>
          Browse lessons →
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 22 }}>
        <ModeCard
          tag="Guided"
          tagClass="pill-jade"
          glyph="師"
          accent="linear-gradient(150deg,#2BB495,#157A63)"
          title="Learn with AI"
          zh="學"
          desc="Play a real game while Master Lin highlights moves, suggests the best one, and grades each move you make."
          cta="Learn now"
          ctaClass="btn-primary"
          onClick={() => go('/learn')}
        />
        <ModeCard
          tag="Compete"
          tagClass="pill-red"
          glyph="帥"
          accent="linear-gradient(150deg,#E0573C,#AE3119)"
          title="Play vs Computer"
          zh="戰"
          desc="Test yourself against three strengths — Beginner, Intermediate, Advanced. No hints, just the game."
          cta="Pick a level"
          ctaClass="btn-red"
          onClick={() => go('/play')}
        />
        <ModeCard
          tag="2 players"
          tagClass="pill-gold"
          glyph="友"
          accent="linear-gradient(150deg,#EBB24B,#C98C1F)"
          title="Play with Friends"
          zh="友"
          desc="Share a room link or play pass-and-play on one screen. Bring a friend to the board."
          cta="Create a room"
          ctaClass="btn-gold"
          onClick={() => go('/multiplayer')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, marginTop: 40 }}>
        {[
          ['Legal moves, lit up', 'Green dots and gold rings show exactly where a piece may go.'],
          ['The why, in plain words', 'Every move comes with a one-line explanation you can actually learn from.'],
          ['Move grading', 'Great, inaccuracy, blunder — instant feedback after each move.'],
          ['Lessons & puzzles', 'Bite-size lessons on every piece, plus checkmate puzzles.'],
        ].map(([t, d], i) => (
          <div key={i} style={{ padding: '4px 4px' }}>
            <div
              style={{
                width: 34,
                height: 4,
                borderRadius: 9,
                background: 'var(--gold)',
                marginBottom: 12,
              }}
            />
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 16,
                marginBottom: 6,
              }}
            >
              {t}
            </div>
            <p
              style={{
                margin: 0,
                color: 'var(--ink-soft)',
                fontSize: 14,
                lineHeight: 1.5,
                fontWeight: 600,
              }}
            >
              {d}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
