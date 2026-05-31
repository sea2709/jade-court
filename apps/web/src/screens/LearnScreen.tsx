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

function ChatBubble({ m }: { m: ChatMessage }) {
  const toneColor =
    {
      great: 'var(--good)',
      good: 'var(--good)',
      ok: 'var(--ink-soft)',
      warn: 'var(--warn)',
      bad: 'var(--bad)',
      info: 'var(--jade-deep)',
      sys: 'var(--muted)',
    }[m.tone ?? 'info'] ?? 'var(--jade-deep)';

  if (m.from === 'system') {
    return (
      <div
        className="pop"
        style={{
          alignSelf: 'center',
          color: 'var(--muted)',
          fontSize: 13,
          fontWeight: 700,
          textAlign: 'center',
          padding: '2px 0',
        }}
      >
        {m.text}
      </div>
    );
  }

  return (
    <div className="pop" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <CoachAvatar size={34} mood={m.think ? 'think' : 'happy'} />
      <div
        style={{
          background: '#fff',
          border: '1px solid var(--line-soft)',
          borderRadius: '4px 16px 16px 16px',
          padding: '11px 14px',
          boxShadow: 'var(--shadow-sm)',
          maxWidth: 320,
        }}
      >
        {m.verdict && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <span
              style={{
                fontWeight: 800,
                fontSize: 13,
                color: toneColor,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {m.emoji} {m.label}
            </span>
            {typeof m.lossCp === 'number' && m.lossCp > 60 && (
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>
                −{(m.lossCp / 100).toFixed(1)}
              </span>
            )}
          </div>
        )}
        <div style={{ fontSize: 14.5, lineHeight: 1.5, fontWeight: 600, color: 'var(--ink)' }}>
          {m.text}
        </div>
        {m.sub && (
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.45,
              color: 'var(--ink-soft)',
              fontWeight: 600,
              marginTop: 5,
            }}
          >
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
    <div
      style={{
        maxWidth: 1180,
        margin: '0 auto',
        padding: '26px 30px 50px',
        display: 'grid',
        gridTemplateColumns: 'auto 380px',
        gap: 30,
        alignItems: 'start',
        justifyContent: 'center',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <span className="pill pill-jade">Learn mode</span>
          <span style={{ fontWeight: 800, color: 'var(--ink-soft)', fontSize: 14 }}>
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
          <CoachAvatar size={44} mood={game.aiThinking ? 'think' : 'happy'} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>
              Master Lin
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 }}>
              Your Xiangqi coach
            </div>
          </div>
          <select
            value={difficulty}
            onChange={(e) =>
              setDifficulty(e.target.value as 'beginner' | 'intermediate' | 'advanced')
            }
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
          >
            <option value="beginner">Gentle</option>
            <option value="intermediate">Firm</option>
            <option value="advanced">Tough</option>
          </select>
        </div>

        <div
          ref={chatRef}
          className="scroll-area"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {messages.map((m) => (
            <ChatBubble key={m.id} m={m} />
          ))}
        </div>

        <div
          style={{
            padding: 14,
            borderTop: '1px solid var(--line-soft)',
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
            background: 'var(--cream)',
          }}
        >
          <div style={{ display: 'flex', gap: 9 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ flex: 1 }}
              disabled={!yourTurn}
              onClick={onHint}
            >
              💡 Show me a hint
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ flex: 1 }}
              disabled={!yourTurn}
              onClick={onExplain}
            >
              What should I look for?
            </button>
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ flex: 1 }}
              disabled={game.history.length === 0}
              onClick={() => game.undoLast(game.turn === 'r' ? 2 : 1)}
            >
              ↶ Take back
            </button>
            <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={newGame}>
              ↻ New game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
