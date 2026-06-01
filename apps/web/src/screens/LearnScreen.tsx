import { useCallback, useEffect, useRef, useState } from 'react';
import { Coach, X } from '@jade-court/xiangqi-engine';
import { CoachAvatar } from '../components/CoachAvatar';
import { XQBoard } from '../components/XQBoard';
import { useXiangqiGame } from '../hooks/useXiangqiGame';

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
        {m.verdict && (
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
        <div className="text-[14.5px] leading-normal font-semibold text-ink">{m.text}</div>
        {m.sub && (
          <div className="text-[13px] leading-snug text-ink-soft font-semibold mt-[5px]">
            {m.sub}
          </div>
        )}
      </div>
    </div>
  );
}

export function LearnScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: ++msgId, from: 'coach', text: Coach.opening() },
  ]);
  const [difficulty, setDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const chatRef = useRef<HTMLDivElement>(null);

  const push = useCallback((m: Omit<ChatMessage, 'id' | 'from'>) => {
    setMessages((ms) => [...ms, { id: ++msgId, from: 'coach', ...m }]);
  }, []);

  const pushSys = useCallback((text: string) => {
    setMessages((ms) => [...ms, { id: ++msgId, from: 'system', text }]);
  }, []);

  const game = useXiangqiGame({
    aiSide: 'b',
    difficulty,
    onSelect: (piece, count) => {
      push({ text: Coach.pieceTip(piece.t, count), tone: 'info' });
    },
    onMove: (move, boardBefore, side, meta) => {
      if (side === 'r') {
        const fb = Coach.feedbackFor(boardBefore, move, 'r', 2);
        push({
          verdict: fb.verdict,
          label: fb.label,
          emoji: fb.emoji,
          tone: fb.tone,
          lossCp: fb.lossCp,
          text: fb.desc,
          sub: fb.body,
        });
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
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const onHint = () => {
    const h = game.showHint(2);
    push({ text: h.text, tone: 'info', sub: h.tip });
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

      <div className="card flex flex-col h-[642px] overflow-hidden">
        <div className="px-[18px] py-4 border-b border-line-soft flex items-center gap-3">
          <CoachAvatar size={44} mood={game.aiThinking ? 'think' : 'happy'} />
          <div>
            <div className="font-display font-extrabold text-[17px]">Master Lin</div>
            <div className="text-[12.5px] text-muted font-bold">Your Xiangqi coach</div>
          </div>
          <select
            value={difficulty}
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
              className="btn btn-primary btn-sm flex-1"
              disabled={!yourTurn}
              onClick={onHint}
            >
              💡 Show me a hint
            </button>
            <button
              type="button"
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
