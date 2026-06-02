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
      className="card rise text-left p-0 overflow-hidden cursor-pointer flex flex-col bg-paper"
      onClick={onClick}
    >
      <div
        className="h-[132px] relative grid place-items-center overflow-hidden"
        style={{ background: accent }}
      >
        <span className="font-piece font-bold text-[92px] text-white/92 drop-shadow-md">
          {glyph}
        </span>
      </div>
      <div className="px-[22px] pt-5 pb-6 flex flex-col gap-2.5 flex-1">
        <span className={`pill ${tagClass} self-start`}>{tag}</span>
        <div>
          <div className="font-display font-extrabold text-[23px] leading-tight">
            {title}{' '}
            <span className="text-muted font-piece font-bold text-[19px]">{zh}</span>
          </div>
          <p className="mt-2 mb-0 text-ink-soft text-[15px] leading-normal font-semibold">
            {desc}
          </p>
        </div>
        <span className={`btn ${ctaClass} self-start mt-1.5`}>{cta}</span>
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
    <div className="page-container-lg">
      <div className="grid grid-cols-[1.05fr_0.95fr] gap-11 items-center mb-[54px]">
        <div className="rise">
          <span className="pill pill-gold mb-[18px]">象棋 · Learn the game of generals</span>
          <h1 className="text-[56px] leading-[1.02] m-0 mb-[18px] tracking-tight">
            Master <span className="text-red-deep">Xiangqi</span>,<br />
            one friendly move at a time.
          </h1>
          <p className="text-[19px] leading-snug text-ink-soft font-semibold max-w-[520px] m-0 mb-7">
            A patient coach who shows you every legal move, explains the why behind it, and plays at
            your level — from your very first game to beating a friend across the river.
          </p>
          <div className="flex gap-3.5 flex-wrap">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => go('/learn')}>
              Start learning →
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={() => go('/play')}>
              Play vs computer
            </button>
          </div>
          <div className="flex items-center gap-3 mt-[26px] text-ink-soft font-bold text-sm">
            <CoachAvatar size={42} />
            <span>
              Guided by <b>Master Lin</b> — your in-game tutor.
            </span>
          </div>
        </div>
        <div className="pop grid place-items-center">
          <XQBoard board={X.initialBoard()} cell={42} interactive={false} />
        </div>
      </div>

      <div className="flex items-baseline justify-between mb-[18px]">
        <h2 className="text-[26px] m-0">Choose how you want to play</h2>
        <button type="button" className="nav-link text-[15px]" onClick={() => go('/lessons')}>
          Browse lessons →
        </button>
      </div>
      <div className="grid grid-cols-3 gap-[22px]">
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

      <div className="grid grid-cols-4 gap-[18px] mt-10">
        {[
          ['Legal moves, lit up', 'Green dots and gold rings show exactly where a piece may go.'],
          ['The why, in plain words', 'Every move comes with a one-line explanation you can actually learn from.'],
          ['Move grading', 'Great, inaccuracy, blunder — instant feedback after each move.'],
          ['Lessons & puzzles', 'Bite-size lessons on every piece, plus checkmate puzzles.'],
        ].map(([t, d], i) => (
          <div key={i} className="p-1">
            <div className="w-[34px] h-1 rounded-[9px] bg-gold mb-3" />
            <div className="font-display font-extrabold text-base mb-1.5">{t}</div>
            <p className="m-0 text-ink-soft text-sm leading-normal font-semibold">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
