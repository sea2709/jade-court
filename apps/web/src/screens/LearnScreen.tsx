import { useCallback, useEffect, useRef, useState } from 'react';
import { Coach } from '@jade-court/xiangqi-engine';
import type {
  Board,
  CoachFeedbackResponse,
  Difficulty,
  Move,
  Side,
} from '@jade-court/xiangqi-engine';
import { CoachAskInput } from '../components/coach/CoachAskInput';
import { CoachChatPanel } from '../components/coach/CoachChatPanel';
import { createCoachMessage, useCoachChat } from '../hooks/useCoachChat';
import { XQBoard } from '../components/XQBoard';
import { useXiangqiGame } from '../hooks/useXiangqiGame';
import { streamCoachPost } from '../lib/coachStream';
import {
  fetchCoachAsk,
  fetchCoachFeedback,
  fetchCoachHint,
  fetchCoachOpening,
  isLlmUnconfigured,
} from '../lib/gemmaApi';

function feedbackToPatch(fb: CoachFeedbackResponse) {
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

function historyPayload(history: { side: Side; from: [number, number]; to: [number, number] }[]) {
  return history.length ? history : undefined;
}

export function LearnScreen() {
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [coachBusy, setCoachBusy] = useState(false);
  const difficultyRef = useRef(difficulty);
  difficultyRef.current = difficulty;

  const chat = useCoachChat([
    createCoachMessage('coach', { text: Coach.opening() }),
  ]);
  const { setMessages, pushCoach } = chat;

  const loadOpening = useCallback(async (replaceFirst = false) => {
    try {
      const { text } = await fetchCoachOpening({ difficulty: difficultyRef.current });
      if (replaceFirst) {
        setMessages((ms) => {
          if (!ms.length || ms[0].from !== 'coach') return ms;
          return [{ ...ms[0], text }, ...ms.slice(1)];
        });
      } else {
        pushCoach({ text });
      }
    } catch (err) {
      if (!isLlmUnconfigured(err)) {
        console.warn('[coach] fetchCoachOpening failed:', err);
      }
    }
  }, [setMessages, pushCoach]);

  useEffect(() => {
    void loadOpening(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only welcome refresh
  }, []);

  const requestCoachFeedback = useCallback(
    async (
      boardBefore: Board,
      move: Move,
      history: { side: Side; from: [number, number]; to: [number, number] }[],
    ) => {
      const pendingId = chat.pushCoach({
        think: true,
        text: 'Let me see how that move plays out…',
      });
      setCoachBusy(true);
      const signal = chat.newAbortSignal();

      const applyTemplate = () => {
        const fb = Coach.feedbackFor(boardBefore, move, 'r', 2);
        chat.replaceMessage(pendingId, {
          verdict: fb.verdict,
          label: fb.label,
          emoji: fb.emoji,
          tone: fb.tone,
          lossCp: fb.lossCp,
          text: fb.desc,
          sub: fb.body,
        });
      };

      try {
        await streamCoachPost(
          '/api/coach/feedback/stream',
          {
            boardBefore,
            move,
            side: 'r',
            depth: 2,
            difficulty: difficultyRef.current,
            history: historyPayload(history),
          },
          {
            onMeta: (meta) => {
              chat.replaceMessage(pendingId, {
                verdict: meta.verdict,
                label: meta.label,
                emoji: meta.emoji,
                tone: meta.tone,
                lossCp: meta.lossCp,
                text: '',
              });
            },
            onToken: (text) => chat.appendToMessage(pendingId, text),
            onError: () => applyTemplate(),
          },
          signal,
        );
      } catch (err) {
        if (signal.aborted) return;
        try {
          const fb = await fetchCoachFeedback({
            boardBefore,
            move,
            side: 'r',
            depth: 2,
            difficulty: difficultyRef.current,
            history,
          });
          chat.replaceMessage(pendingId, feedbackToPatch(fb));
        } catch (batchErr) {
          if (!isLlmUnconfigured(batchErr)) {
            console.warn('[coach] feedback failed, using template:', batchErr);
          }
          applyTemplate();
        }
      } finally {
        if (!signal.aborted) setCoachBusy(false);
      }
    },
    [chat],
  );

  const game = useXiangqiGame({
    aiSide: 'b',
    difficulty,
    aiProvider: 'llm',
    onSelect: (piece, count) => {
      chat.pushCoach({ text: Coach.pieceTip(piece.t, count), tone: 'info' });
    },
    onMove: (move, boardBefore, side, meta) => {
      if (side === 'r') {
        chat.pushPlayer({ text: Coach.describeMove(boardBefore, move) });
        void requestCoachFeedback(boardBefore, move, meta.history ?? []);
      } else {
        const text =
          meta.aiComment ?? `I'll play ${Coach.describeMove(boardBefore, move)}`;
        chat.pushCoach({ text, tone: 'info' });
        if (meta.gaveCheck) chat.pushCoach({ text: Coach.checkAlert('r'), tone: 'bad' });
      }
      if (meta.status === 'checkmate') {
        chat.pushSys(side === 'r' ? '🏆 Checkmate — you win!' : 'Checkmate — I win this one. Rematch?');
      } else if (meta.status === 'stalemate') {
        chat.pushSys("Stalemate — no legal moves. That's a loss for the side to move in Xiangqi.");
      }
    },
  });

  const gameHistory = useCallback(
    () =>
      game.history.map((h) => ({
        side: h.side,
        from: h.move.from,
        to: h.move.to,
      })),
    [game.history],
  );

  const onHint = async () => {
    const pendingId = chat.pushCoach({
      think: true,
      text: 'Looking for the strongest idea…',
    });
    setCoachBusy(true);
    const signal = chat.newAbortSignal();
    let hinted = false;

    const applyTemplate = () => {
      const h = game.showHint(2);
      chat.replaceMessage(pendingId, { text: h.text, tone: 'info', sub: h.tip || undefined });
    };

    try {
      await streamCoachPost(
        '/api/coach/hint/stream',
        {
          board: game.board,
          side: game.turn,
          depth: 2,
          difficulty,
        },
        {
          onMeta: (meta) => {
            if (meta.move && !hinted) {
              game.revealHint(meta.move);
              hinted = true;
            }
            chat.replaceMessage(pendingId, { text: '', tone: 'info' });
          },
          onToken: (text) => chat.appendToMessage(pendingId, text),
          onError: () => applyTemplate(),
        },
        signal,
      );
    } catch (err) {
      if (signal.aborted) return;
      try {
        const h = await fetchCoachHint({
          board: game.board,
          side: game.turn,
          depth: 2,
          difficulty,
        });
        game.revealHint(h.move);
        chat.replaceMessage(pendingId, { text: h.text, tone: 'info', sub: h.tip });
      } catch (batchErr) {
        if (!isLlmUnconfigured(batchErr)) {
          console.warn('[coach] fetchCoachHint failed, using template:', batchErr);
        }
        applyTemplate();
      }
    } finally {
      if (!signal.aborted) setCoachBusy(false);
    }
  };

  const askCoach = useCallback(
    async (question: string) => {
      chat.pushPlayer({ text: question });
      const pendingId = chat.pushCoach({ think: true, text: 'Let me think about that…' });
      setCoachBusy(true);
      const signal = chat.newAbortSignal();

      const applyTemplate = () => {
        chat.replaceMessage(pendingId, { text: Coach.askReply(), tone: 'info' });
      };

      try {
        await streamCoachPost(
          '/api/coach/ask/stream',
          {
            board: game.board,
            side: game.turn,
            question,
            difficulty: difficultyRef.current,
            history: historyPayload(gameHistory()),
          },
          {
            onToken: (text) => chat.appendToMessage(pendingId, text),
            onError: () => applyTemplate(),
          },
          signal,
        );
      } catch (err) {
        if (signal.aborted) return;
        try {
          const res = await fetchCoachAsk({
            board: game.board,
            side: game.turn,
            question,
            difficulty: difficultyRef.current,
            history: gameHistory(),
          });
          chat.replaceMessage(pendingId, { text: res.text, tone: 'info' });
        } catch (batchErr) {
          if (!isLlmUnconfigured(batchErr)) {
            console.warn('[coach] ask failed, using template:', batchErr);
          }
          applyTemplate();
        }
      } finally {
        if (!signal.aborted) setCoachBusy(false);
      }
    },
    [chat, game.board, game.turn, gameHistory],
  );

  const onExplain = () => {
    void askCoach('What should I focus on this turn?');
  };

  const newGame = () => {
    game.reset();
    chat.resetMessages([createCoachMessage('coach', { text: Coach.opening() })]);
    void loadOpening(true);
  };

  const yourTurn = game.turn === 'r' && !game.status;
  const inputDisabled = coachBusy || !!game.status;

  return (
    <div className="learn-layout">
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

      <CoachChatPanel
        messages={chat.messages}
        chatRef={chat.chatRef}
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        coachThinking={game.aiThinking || coachBusy}
        footer={
          <>
            <CoachAskInput disabled={inputDisabled} onAsk={(q) => void askCoach(q)} />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm flex-1"
                disabled={!yourTurn || coachBusy}
                onClick={() => void onHint()}
              >
                💡 Show me a hint
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm flex-1"
                disabled={!yourTurn || coachBusy}
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
          </>
        }
      />
    </div>
  );
}
