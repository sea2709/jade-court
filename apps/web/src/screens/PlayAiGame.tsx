/**
 * Active Play with AI game: board, coach chat, model picker, day-pass bar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { PlayAiAccessOverlay } from '../components/play-ai/PlayAiAccessOverlay';
import { PlayAiDayPassBar } from '../components/play-ai/PlayAiDayPassBar';
import { XQBoard } from '../components/XQBoard';
import { ConfirmNewGameDialog } from '../components/ConfirmNewGameDialog';
import { SavedGameAlertBanner } from '../components/SavedGameAlertBanner';
import { useAiModels } from '../hooks/useAiModels';
import { createCoachMessage, useCoachChat } from '../hooks/useCoachChat';
import { useSavedGame, type UseSavedGameResult } from '../hooks/useSavedGame';
import { useXiangqiGame } from '../hooks/useXiangqiGame';
import { formatResumedAt } from '../lib/formatGameTime';
import type { ActiveGameSave, AiGameConfig } from '../lib/gamesApi';
import { assignCheckoutUrl, BillingApiError, postBillingCheckout } from '../lib/billingApi';
import { streamCoachPost } from '../lib/coachStream';
import {
  fetchCoachAsk,
  fetchCoachFeedback,
  fetchCoachHint,
  fetchCoachOpening,
  isAuthRequired,
  isLlmUnconfigured,
  isPlayAccessRequired,
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

/** When SSE emits `error`, retry batch coach with the same preset before engine template. */
async function coachStreamErrorFallback(
  modelId: string | undefined,
  batch: () => Promise<void>,
  applyTemplate: () => void,
  handleCoachGated: (err: unknown) => boolean,
  route: string,
): Promise<void> {
  if (!modelId) {
    applyTemplate();
    return;
  }
  try {
    await batch();
  } catch (batchErr) {
    if (handleCoachGated(batchErr)) return;
    if (!isLlmUnconfigured(batchErr)) {
      console.warn(`[coach] ${route} batch failed after stream error:`, batchErr);
    }
    applyTemplate();
  }
}

export interface PlayAiGameProps {
  accessUntil: string | null;
  preferredModelId: string | null;
  resumeSave?: ActiveGameSave;
  saved?: UseSavedGameResult;
}

type PlayAiGameSessionProps = PlayAiGameProps & { saved: UseSavedGameResult };

function PlayAiGameSession({
  accessUntil,
  preferredModelId,
  resumeSave,
  saved,
}: PlayAiGameSessionProps) {
  const resumeCfg = resumeSave?.config as AiGameConfig | undefined;

  const [difficulty, setDifficulty] = useState<Difficulty>(resumeCfg?.difficulty ?? 'beginner');
  const [coachBusy, setCoachBusy] = useState(false);
  const [accessOverlay, setAccessOverlay] = useState<'auth' | 'access' | null>(null);
  const [extendBusy, setExtendBusy] = useState(false);
  const [confirmNewGame, setConfirmNewGame] = useState(false);
  const resumedLineRef = useRef(false);

  const aiModels = useAiModels(resumeCfg?.modelId ?? preferredModelId);
  const modelId = aiModels.modelId ?? undefined;

  const initialChat = useMemo(() => {
    if (resumeSave?.chat?.length) return resumeSave.chat;
    return [createCoachMessage('coach', { text: Coach.opening() })];
  }, [resumeSave]);

  const chat = useCoachChat(initialChat);
  const { setMessages, pushCoach, pushSys } = chat;

  const handleGatedError = useCallback((kind: 'auth' | 'access') => {
    setAccessOverlay(kind);
  }, []);

  const handleCoachGated = useCallback((err: unknown) => {
    if (isAuthRequired(err)) {
      setAccessOverlay('auth');
      return true;
    }
    if (isPlayAccessRequired(err)) {
      setAccessOverlay('access');
      return true;
    }
    return false;
  }, []);

  const loadOpening = useCallback(
    async (replaceFirst = false) => {
      try {
        const { text } = await fetchCoachOpening({ difficulty, modelId });
        if (replaceFirst) {
          setMessages((ms) => {
            if (!ms.length || ms[0].from !== 'coach') return ms;
            return [{ ...ms[0], text }, ...ms.slice(1)];
          });
        } else {
          pushCoach({ text });
        }
      } catch (err) {
        if (handleCoachGated(err)) return;
        if (!isLlmUnconfigured(err)) {
          console.warn('[coach] fetchCoachOpening failed:', err);
        }
      }
    },
    [difficulty, modelId, setMessages, pushCoach, handleCoachGated],
  );

  useEffect(() => {
    if (resumeSave && !resumedLineRef.current) {
      resumedLineRef.current = true;
      pushSys(`Resumed your game from ${formatResumedAt(resumeSave.updatedAt)}`);
      return;
    }
    void loadOpening(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            difficulty,
            history: historyPayload(history),
            ...(modelId ? { modelId } : {}),
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
            onError: () => {
              void coachStreamErrorFallback(
                modelId,
                async () => {
                  const fb = await fetchCoachFeedback({
                    boardBefore,
                    move,
                    side: 'r',
                    depth: 2,
                    difficulty,
                    history,
                    modelId,
                  });
                  chat.replaceMessage(pendingId, feedbackToPatch(fb));
                },
                applyTemplate,
                handleCoachGated,
                'feedback',
              );
            },
          },
          signal,
        );
      } catch (err) {
        if (signal.aborted) return;
        if (handleCoachGated(err)) return;
        try {
          const fb = await fetchCoachFeedback({
            boardBefore,
            move,
            side: 'r',
            depth: 2,
            difficulty,
            history,
            modelId,
          });
          chat.replaceMessage(pendingId, feedbackToPatch(fb));
        } catch (batchErr) {
          if (handleCoachGated(batchErr)) return;
          if (!isLlmUnconfigured(batchErr)) {
            console.warn('[coach] feedback failed, using template:', batchErr);
          }
          applyTemplate();
        }
      } finally {
        if (!signal.aborted) setCoachBusy(false);
      }
    },
    [chat, difficulty, modelId, handleCoachGated],
  );

  const game = useXiangqiGame({
    aiSide: 'b',
    difficulty,
    aiProvider: 'llm',
    modelId,
    initialMoves: resumeSave?.moves,
    locked: accessOverlay !== null,
    onGatedError: handleGatedError,
    onSelect: (piece, count) => {
      chat.pushCoach({ text: Coach.pieceTip(piece.t, count), tone: 'info' });
    },
    onMove: (move, boardBefore, side, meta) => {
      if (side === 'r') {
        chat.pushPlayer({ text: Coach.describeMove(boardBefore, move) });
        void requestCoachFeedback(boardBefore, move, meta.history ?? []);
      } else {
        const text = meta.aiComment ?? `I'll play ${Coach.describeMove(boardBefore, move)}`;
        chat.pushCoach({ text, tone: 'info' });
        if (meta.gaveCheck) chat.pushCoach({ text: Coach.checkAlert('r'), tone: 'bad' });
      }
      if (meta.status === 'checkmate') {
        chat.pushSys(
          side === 'r' ? '🏆 Checkmate — you win!' : 'Checkmate — I win this one. Rematch?',
        );
      } else if (meta.status === 'stalemate') {
        chat.pushSys("Stalemate — no legal moves. That's a loss for the side to move in Xiangqi.");
      }
    },
  });

  useEffect(() => {
    if (!saved.signedIn || !modelId) return;
    const settled = !game.aiThinking && !game.revealingOpponentMove;
    const config: AiGameConfig = {
      modelId,
      difficulty,
      side: 'r',
    };
    const moves = game.history.map((h) => ({
      from: h.move.from as [number, number],
      to: h.move.to as [number, number],
    }));
    saved.scheduleAutosave({ config, moves, chat: chat.messages }, { enabled: settled });
  }, [
    saved,
    saved.signedIn,
    modelId,
    difficulty,
    game.history,
    game.aiThinking,
    game.revealingOpponentMove,
    game.status,
    chat.messages,
    resumeCfg?.modelId,
  ]);

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
          ...(modelId ? { modelId } : {}),
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
          onError: () => {
            void coachStreamErrorFallback(
              modelId,
              async () => {
                const h = await fetchCoachHint({
                  board: game.board,
                  side: game.turn,
                  depth: 2,
                  difficulty,
                  modelId,
                });
                game.revealHint(h.move);
                chat.replaceMessage(pendingId, { text: h.text, tone: 'info', sub: h.tip });
              },
              applyTemplate,
              handleCoachGated,
              'hint',
            );
          },
        },
        signal,
      );
    } catch (err) {
      if (signal.aborted) return;
      if (handleCoachGated(err)) return;
      try {
        const h = await fetchCoachHint({
          board: game.board,
          side: game.turn,
          depth: 2,
          difficulty,
          modelId,
        });
        game.revealHint(h.move);
        chat.replaceMessage(pendingId, { text: h.text, tone: 'info', sub: h.tip });
      } catch (batchErr) {
        if (handleCoachGated(batchErr)) return;
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
            difficulty,
            history: historyPayload(gameHistory()),
            ...(modelId ? { modelId } : {}),
          },
          {
            onToken: (text) => chat.appendToMessage(pendingId, text),
            onError: () => {
              void coachStreamErrorFallback(
                modelId,
                async () => {
                  const res = await fetchCoachAsk({
                    board: game.board,
                    side: game.turn,
                    question,
                    difficulty,
                    history: gameHistory(),
                    modelId,
                  });
                  chat.replaceMessage(pendingId, { text: res.text, tone: 'info' });
                },
                applyTemplate,
                handleCoachGated,
                'ask',
              );
            },
          },
          signal,
        );
      } catch (err) {
        if (signal.aborted) return;
        if (handleCoachGated(err)) return;
        try {
          const res = await fetchCoachAsk({
            board: game.board,
            side: game.turn,
            question,
            difficulty,
            history: gameHistory(),
            modelId,
          });
          chat.replaceMessage(pendingId, { text: res.text, tone: 'info' });
        } catch (batchErr) {
          if (handleCoachGated(batchErr)) return;
          if (!isLlmUnconfigured(batchErr)) {
            console.warn('[coach] ask failed, using template:', batchErr);
          }
          applyTemplate();
        }
      } finally {
        if (!signal.aborted) setCoachBusy(false);
      }
    },
    [chat, difficulty, game.board, game.turn, gameHistory, modelId, handleCoachGated],
  );

  const onExplain = () => {
    void askCoach('What should I focus on this turn?');
  };

  const onModelChange = (id: string) => {
    const label = aiModels.models.find((m) => m.id === id)?.label ?? id;
    aiModels.pickModel(id);
    chat.pushSys(`Master Lin (AI) now runs on ${label}`);
    if (saved.signedIn) {
      const config: AiGameConfig = {
        modelId: id,
        difficulty,
        side: 'r',
      };
      const moves = game.history.map((h) => ({
        from: h.move.from as [number, number],
        to: h.move.to as [number, number],
      }));
      saved.scheduleAutosave({ config, moves, chat: chat.messages });
    }
  };

  const startFreshGame = () => {
    if (accessOverlay !== null) return;
    game.reset();
    chat.resetMessages([createCoachMessage('coach', { text: Coach.opening() })]);
    void loadOpening(true);
    setConfirmNewGame(false);
  };

  const newGame = () => {
    if (accessOverlay !== null) return;
    if (saved.save && game.history.length > 0) {
      setConfirmNewGame(true);
      return;
    }
    void saved.abandon();
    startFreshGame();
  };

  const confirmAbandonAndNew = async () => {
    await saved.abandon();
    startFreshGame();
  };

  const startExtendCheckout = async () => {
    setExtendBusy(true);
    try {
      const { url } = await postBillingCheckout();
      assignCheckoutUrl(url);
    } catch (err) {
      if (!(err instanceof BillingApiError && err.status === 503)) {
        console.warn('[billing] checkout failed:', err);
      }
      setExtendBusy(false);
    }
  };

  const yourTurn = game.turn === 'r' && !game.status;
  const inputDisabled = coachBusy || !!game.status || accessOverlay !== null;

  const statusLine = game.status
    ? 'Game over'
    : game.aiThinking
      ? 'Master Lin (AI) is thinking…'
      : yourTurn
        ? 'Your move (Red) · vs Master Lin (AI)'
        : 'vs Master Lin (AI)';

  return (
    <div className="learn-layout" data-testid="play-ai-game">
      {confirmNewGame ? (
        <ConfirmNewGameDialog
          onConfirm={() => void confirmAbandonAndNew()}
          onCancel={() => setConfirmNewGame(false)}
        />
      ) : null}
      <div className="relative">
        <PlayAiDayPassBar
          accessUntil={accessUntil}
          onExtend={() => void startExtendCheckout()}
          extendBusy={extendBusy}
        />
        <div className="flex items-center gap-3 mb-3.5">
          <span className="pill pill-jade">Play with AI</span>
          <span className="font-extrabold text-ink-soft text-sm">{statusLine}</span>
          {game.checkSide && !game.status && <span className="pill pill-red">Check!</span>}
        </div>
        <div className="relative">
          <XQBoard
            board={game.board}
            cell={56}
            selected={game.selected}
            targets={game.targets}
            lastMove={game.lastMove}
            checkPos={game.checkPos}
            hint={game.hint}
            onPoint={game.onPoint}
            interactive={yourTurn && accessOverlay === null}
          />
          {accessOverlay ? (
            <PlayAiAccessOverlay kind={accessOverlay} onRenew={() => void startExtendCheckout()} />
          ) : null}
        </div>
        <p className="mt-3 mb-0 text-[13px] font-bold text-muted">
          Master Lin, AI player · running {aiModels.modelRunningCaption}
        </p>
        <p className="mt-1 mb-0 text-[12px] font-semibold text-muted">
          Master Lin is an AI. Its moves and advice can be wrong.
        </p>
      </div>

      <CoachChatPanel
        messages={chat.messages}
        chatRef={chat.chatRef}
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        coachThinking={game.aiThinking || coachBusy}
        models={aiModels.models}
        modelId={aiModels.modelId}
        onModelChange={onModelChange}
        modelsDisabled={aiModels.modelsDisabled}
        modelsLoading={aiModels.status === 'loading'}
        footer={
          <>
            <CoachAskInput disabled={inputDisabled} onAsk={(q) => void askCoach(q)} />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm flex-1"
                disabled={!yourTurn || coachBusy || accessOverlay !== null}
                onClick={() => void onHint()}
              >
                💡 Show me a hint
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm flex-1"
                disabled={!yourTurn || coachBusy || accessOverlay !== null}
                onClick={onExplain}
              >
                What should I look for?
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm flex-1"
                disabled={game.history.length === 0 || accessOverlay !== null}
                onClick={() => game.undoLast(game.turn === 'r' ? 2 : 1)}
              >
                ↶ Take back
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm flex-1"
                disabled={accessOverlay !== null}
                onClick={newGame}
              >
                ↻ New game
              </button>
            </div>
          </>
        }
      />
    </div>
  );
}

/** Shell: save alerts + remountable session after server reload. */
export function PlayAiGame(props: PlayAiGameProps) {
  const savedFallback = useSavedGame('ai');
  const saved = props.saved ?? savedFallback;
  const [reloadSave, setReloadSave] = useState<ActiveGameSave | undefined>();
  const [sessionKey, setSessionKey] = useState(0);
  const sessionResume = reloadSave ?? props.resumeSave;

  const reloadGameFromServer = async () => {
    const loaded = await saved.reloadFromServer();
    if (!loaded) return;
    setReloadSave(loaded);
    setSessionKey((k) => k + 1);
  };

  return (
    <>
      <SavedGameAlertBanner
        staleRevisionError={saved.staleRevisionError}
        saveError={saved.saveError}
        onReloadSave={() => void reloadGameFromServer()}
      />
      <PlayAiGameSession key={sessionKey} {...props} resumeSave={sessionResume} saved={saved} />
    </>
  );
}
