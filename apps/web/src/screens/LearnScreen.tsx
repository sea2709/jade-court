import { useCallback, useEffect, useRef, useState } from 'react';
import { Coach } from '@jade-court/xiangqi-engine';
import type {
  Board,
  CoachFeedbackResponse,
  Difficulty,
  Move,
  Side,
} from '@jade-court/xiangqi-engine';
import { CoachAvatar } from '../components/CoachAvatar';
import { XQBoard } from '../components/XQBoard';
import { useXiangqiGame } from '../hooks/useXiangqiGame';
import {
  fetchCoachFeedback,
  fetchCoachHint,
  fetchCoachOpening,
  isGemmaUnconfigured,
} from '../lib/gemmaApi';

let msgId = 0;

interface ChatMessage {
  id: number;
  from: 'coach' | 'system';
  text: string;
  verdict?: string;
  label?: string;
  emoji?: string;
  tone?: string;
  lossCp?: number;
  sub?: string;
  think?: boolean;
}

const TONE_CLASS: Record<string, string> = {
  great: 'text-good',
  good: 'text-good',
  ok: 'text-ink-soft',
  warn: 'text-warn',
  bad: 'text-bad',
  info: 'text-jade-deep',
  sys: 'text-muted',
};

function ChatBubble({ m }: { m: ChatMessage }) {
  const toneClass = TONE_CLASS[m.tone ?? 'info'] ?? 'text-jade-deep';

  if (m.from === 'system') {
    return (
      <div className="pop self-center text-muted text-[13px] font-bold text-center py-0.5">
        {m.text}
      </div>
    );
  }

  return (
    <div className="pop flex gap-2.5 items-start">
      <CoachAvatar size={34} mood={m.think ? 'think' : 'happy'} />
      <div className="chat-bubble">
        {m.verdict && !m.think && (
          <div className="flex items-center gap-[7px] mb-1">
            <span className={`font-extrabold text-[13px] inline-flex items-center gap-[5px] ${toneClass}`}>
              {m.emoji} {m.label}
            </span>
            {typeof m.lossCp === 'number' && m.lossCp > 60 && (
              <span className="text-[11px] text-muted font-bold">
                −{(m.lossCp / 100).toFixed(1)}
              </span>
            )}
          </div>
        )}
        <div style={{ fontSize: 14.5, lineHeight: 1.5, fontWeight: 600, color: 'var(--ink)' }}>
          {m.text}
        </div>
        {m.sub && !m.think && (
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.45,
              color: 'var(--ink-soft)',
              fontWeight: 600,
              marginTop: 5,
            }}
          >
        <div className="text-[14.5px] leading-normal font-semibold text-ink">{m.text}</div>
        {m.sub && !m.think && (
          <div className="text-[13px] leading-snug text-ink-soft font-semibold mt-[5px]">
            {m.sub}
          </div>
        )}
      </div>
    </div>
  );
}

function feedbackToMessage(fb: CoachFeedbackResponse): Omit<ChatMessage, 'id' | 'from'> {
  return {
    verdict: fb.verdict,
    label: fb.label,
    emoji: fb.emoji,
    tone: fb.tone,
    lossCp: fb.lossCp,
    text: fb.desc,
    sub: fb.body,
  };
}

export function LearnScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: ++msgId, from: 'coach', text: Coach.opening() },
  ]);
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [coachBusy, setCoachBusy] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const difficultyRef = useRef(difficulty);
  difficultyRef.current = difficulty;

  const replaceMessage = useCallback((id: number, patch: Partial<ChatMessage>) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch, think: false } : m)));
  }, []);

  const push = useCallback((m: Omit<ChatMessage, 'id' | 'from'>) => {
    setMessages((ms) => [...ms, { id: ++msgId, from: 'coach', ...m }]);
  }, []);

  const pushSys = useCallback((text: string) => {
    setMessages((ms) => [...ms, { id: ++msgId, from: 'system', text }]);
  }, []);

  const requestCoachFeedback = useCallback(
    async (
      boardBefore: Board,
      move: Move,
      history: { side: Side; from: [number, number]; to: [number, number] }[],
    ) => {
      const pendingId = ++msgId;
      setMessages((ms) => [
        ...ms,
        {
          id: pendingId,
          from: 'coach',
          think: true,
          text: 'Let me see how that move plays out…',
        },
      ]);
      setCoachBusy(true);
      try {
        const fb = await fetchCoachFeedback({
          boardBefore,
          move,
          side: 'r',
          depth: 2,
          difficulty: difficultyRef.current,
          history,
        });
        replaceMessage(pendingId, feedbackToMessage(fb));
      } catch (err) {
        if (!isGemmaUnconfigured(err)) {
          console.warn('[coach] fetchCoachFeedback failed, using template:', err);
        }
        const fb = Coach.feedbackFor(boardBefore, move, 'r', 2);
        replaceMessage(pendingId, {
          verdict: fb.verdict,
          label: fb.label,
          emoji: fb.emoji,
          tone: fb.tone,
          lossCp: fb.lossCp,
          text: fb.desc,
          sub: fb.body,
        });
      } finally {
        setCoachBusy(false);
      }
    },
    [replaceMessage],
  );

  const game = useXiangqiGame({
    aiSide: 'b',
    difficulty,
    onSelect: (piece, count) => {
      push({ text: Coach.pieceTip(piece.t, count), tone: 'info' });
    },
    onMove: (move, boardBefore, side, meta) => {
      if (side === 'r') {
        void requestCoachFeedback(boardBefore, move, meta.history ?? []);
      } else {
        const text =
          meta.aiComment ?? `I'll play ${Coach.describeMove(boardBefore, move)}`;
        push({ text, tone: 'info' });
        if (meta.gaveCheck) push({ text: Coach.checkAlert('r'), tone: 'bad' });
      }
      if (meta.status === 'checkmate') {
        pushSys(side === 'r' ? '🏆 Checkmate — you win!' : 'Checkmate — I win this one. Rematch?');
      } else if (meta.status === 'stalemate') {
        pushSys('Stalemate — no legal moves. That\'s a loss for the side to move in Xiangqi.');
      }
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { text } = await fetchCoachOpening({ difficulty: difficultyRef.current });
        if (!cancelled) {
          setMessages((ms) => {
            if (!ms.length || ms[0].from !== 'coach') return ms;
            return [{ ...ms[0], text }, ...ms.slice(1)];
          });
        }
      } catch (err) {
        if (!isGemmaUnconfigured(err)) {
          console.warn('[coach] fetchCoachOpening failed, keeping template welcome:', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const onHint = async () => {
    const pendingId = ++msgId;
    setMessages((ms) => [
      ...ms,
      { id: pendingId, from: 'coach', think: true, text: 'Looking for the strongest idea…' },
    ]);
    setCoachBusy(true);
    try {
      const h = await fetchCoachHint({
        board: game.board,
        side: game.turn,
        depth: 2,
        difficulty,
      });
      game.revealHint(h.move);
      replaceMessage(pendingId, { text: h.text, tone: 'info', sub: h.tip });
    } catch (err) {
      if (!isGemmaUnconfigured(err)) {
        console.warn('[coach] fetchCoachHint failed, using template:', err);
      }
      const h = game.showHint(2);
      replaceMessage(pendingId, { text: h.text, tone: 'info', sub: h.tip || undefined });
    } finally {
      setCoachBusy(false);
    }
  };

  const onExplain = () => {
    const turnTxt =
      game.checkSide === 'r'
        ? "You're in check — your only job this move is to save the General."
        : "It's your move (red). Look for active chariots, cannon screens, and advancing soldiers.";
    push({ text: turnTxt, tone: 'info' });
  };

  const newGame = () => {
    game.reset();
    setMessages([{ id: ++msgId, from: 'coach', text: `Fresh board! ${Coach.opening()}` }]);
  };

  const yourTurn = game.turn === 'r' && !game.status;

  return (
    <div className="max-w-[1180px] mx-auto px-[30px] pt-[26px] pb-[50px] grid gap-[30px] items-start justify-center grid-cols-[auto_380px]">
      <div>
        <div className="flex items-center gap-3 mb-3.5">
          <span className="pill pill-jade">Learn mode</span>
          <span className="font-extrabold text-ink-soft text-sm">
            {game.status
              ? 'Game over'
              : game.aiThinking
                ? 'Master Lin is thinking…'
                : yourTurn
                  ? 'Your move (Red)'
                  : 'Opponent to move'}
          </span>
          {game.checkSide && !game.status && <span className="pill pill-red">Check!</span>}
        </div>
        <XQBoard
          board={game.board}
          cell={56}
          selected={game.selected}
          targets={game.targets}
          lastMove={game.lastMove}
          checkPos={game.checkPos}
          hint={game.hint}
          onPoint={game.onPoint}
          interactive={yourTurn}
        />
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 642, overflow: 'hidden' }}>
        <div
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid var(--line-soft)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <CoachAvatar size={44} mood={game.aiThinking || coachBusy ? 'think' : 'happy'} />
      <div className="card flex flex-col h-[642px] overflow-hidden">
        <div className="px-[18px] py-4 border-b border-line-soft flex items-center gap-3">
          <CoachAvatar size={44} mood={game.aiThinking ? 'think' : 'happy'} />
          <div>
            <div className="font-display font-extrabold text-[17px]">Master Lin</div>
            <div className="text-[12.5px] text-muted font-bold">Your Xiangqi coach</div>
          </div>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: 13,
              border: '1px solid var(--line-soft)',
              borderRadius: 999,
              padding: '6px 10px',
              background: '#fff',
              color: 'var(--ink)',
            }}
            onChange={(e) =>
              setDifficulty(e.target.value as 'beginner' | 'intermediate' | 'advanced')
            }
            className="chat-select"
          >
            <option value="beginner">Gentle</option>
            <option value="intermediate">Firm</option>
            <option value="advanced">Tough</option>
          </select>
        </div>

        <div
          ref={chatRef}
          className="scroll-area flex-1 overflow-y-auto p-4 flex flex-col gap-3"
        >
          {messages.map((m) => (
            <ChatBubble key={m.id} m={m} />
          ))}
        </div>

        <div className="p-3.5 border-t border-line-soft flex flex-col gap-2 bg-cream">
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ flex: 1 }}
              disabled={!yourTurn || coachBusy}
              onClick={() => void onHint()}
              className="btn btn-primary btn-sm flex-1"
              disabled={!yourTurn}
              onClick={onHint}
            >
              💡 Show me a hint
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ flex: 1 }}
              disabled={!yourTurn || coachBusy}
              className="btn btn-ghost btn-sm flex-1"
              disabled={!yourTurn}
              onClick={onExplain}
            >
              What should I look for?
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm flex-1"
              disabled={game.history.length === 0}
              onClick={() => game.undoLast(game.turn === 'r' ? 2 : 1)}
            >
              ↶ Take back
            </button>
            <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={newGame}>
              ↻ New game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
