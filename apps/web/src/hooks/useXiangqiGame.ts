import { AI, Coach, X } from '@jade-court/xiangqi-engine';
import {
  fetchAiMove,
  fetchEngineMove,
  GemmaApiError,
  isGemmaUnconfigured,
  isPikafishUnconfigured,
} from '../lib/gemmaApi';
import type {
  Board,
  Coord,
  Difficulty,
  GameStatus,
  Move,
  Piece,
  PieceType,
  Side,
} from '@jade-court/xiangqi-engine';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

export interface MoveMeta {
  captured: PieceType | null;
  gaveCheck: boolean;
  status: GameStatus;
  /** Set when the AI move came from Gemma with commentary. */
  aiComment?: string;
  /** Plies before this move (for coach / Gemma context). */
  history?: { side: Side; from: Coord; to: Coord }[];
}

export type AiProvider = 'gemma' | 'engine' | 'local';

export interface GameConfig {
  aiSide?: Side;
  difficulty?: Difficulty;
  /** Opponent backend: Pikafish UCI, Gemma, or local negamax (falls back to local on errors). */
  aiProvider?: AiProvider;
  /** Minimum delay before the AI plays (ms). Default ~900–1400 random. */
  aiThinkDelayMs?: number;
  /** Pause after an AI ply so the move is easier to notice (ms). Default 1200; 0 = off. */
  revealOpponentMoveMs?: number;
  locked?: boolean;
  onMove?: (move: Move, boardBefore: Board, side: Side, meta: MoveMeta) => void;
  onSelect?: (piece: Piece, count: number, pos: Coord) => void;
  onAIThinking?: (thinking: boolean) => void;
}

interface HistoryEntry {
  move: Move;
  side: Side;
  capturedType: PieceType | null;
  boardBefore: Board;
}

interface GameState {
  board: Board;
  turn: Side;
  selected: Coord | null;
  targets: Move[];
  lastMove: { from: Coord; to: Coord } | null;
  history: HistoryEntry[];
  status: GameStatus;
  hintMove: { from: Coord; to: Coord } | null;
}

type GameAction =
  | { type: 'POINT'; r: number; c: number; locked?: boolean; aiSide?: Side }
  | { type: 'APPLY_MOVE'; move: Move }
  | { type: 'UNDO'; count: number }
  | { type: 'RESET'; startBoard?: Board }
  | { type: 'SET_HINT'; move: { from: Coord; to: Coord } | null };

function freezeMove(move: Move): Move {
  return { from: [...move.from], to: [...move.to], capture: move.capture };
}

function initialGameState(startBoard?: Board): GameState {
  return {
    board: startBoard ? X.cloneBoard(startBoard) : X.initialBoard(),
    turn: 'r',
    selected: null,
    targets: [],
    lastMove: null,
    history: [],
    status: null,
    hintMove: null,
  };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'POINT': {
      if (state.status) return state;
      if (action.locked) return state;
      const { r, c } = action;
      if (r < 0) return { ...state, selected: null, targets: [] };

      const humanCanMove = (side: Side) => !action.aiSide || side !== action.aiSide;
      const p = state.board[r][c];

      if (state.selected) {
        const t = state.targets.find((m) => m.to[0] === r && m.to[1] === c);
        if (t) return gameReducer(state, { type: 'APPLY_MOVE', move: t });
        // Second click on the selected piece toggles off legal-move hints.
        if (state.selected[0] === r && state.selected[1] === c) {
          return { ...state, selected: null, targets: [], hintMove: null };
        }
      }
      if (p && p.s === state.turn && humanCanMove(p.s)) {
        return {
          ...state,
          selected: [r, c],
          targets: X.movesFrom(state.board, r, c),
          hintMove: null,
        };
      }
      return { ...state, selected: null, targets: [] };
    }
    case 'APPLY_MOVE': {
      const move = freezeMove(action.move);
      const mover = state.board[move.from[0]][move.from[1]];
      if (!mover) return state;

      const boardBefore = X.cloneBoard(state.board);
      const capturedPiece = state.board[move.to[0]][move.to[1]];
      const board = X.applyMove(state.board, move);
      const side = mover.s;
      const turn = X.opp(side);
      const status = X.gameStatus(board, turn);

      return {
        board,
        turn,
        selected: null,
        targets: [],
        lastMove: { from: move.from, to: move.to },
        history: [
          ...state.history,
          {
            move,
            side,
            capturedType: capturedPiece?.t ?? null,
            boardBefore,
          },
        ],
        status,
        hintMove: null,
      };
    }
    case 'UNDO': {
      const keep = Math.max(0, state.history.length - action.count);
      const board =
        keep > 0 ? X.cloneBoard(state.history[keep].boardBefore) : X.initialBoard();
      const lastEntry = keep > 0 ? state.history[keep - 1] : null;
      const turn = lastEntry ? X.opp(lastEntry.side) : 'r';
      return {
        board,
        turn,
        selected: null,
        targets: [],
        lastMove: lastEntry
          ? { from: [...lastEntry.move.from], to: [...lastEntry.move.to] }
          : null,
        history: state.history.slice(0, keep),
        status: keep > 0 ? X.gameStatus(board, turn) : null,
        hintMove: null,
      };
    }
    case 'RESET':
      return initialGameState(action.startBoard);
    case 'SET_HINT':
      return { ...state, hintMove: action.move };
    default:
      return state;
  }
}

function lastAiMoveText(history: HistoryEntry[], aiSide: Side): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.side === aiSide) {
      return Coach.describeMove(h.boardBefore, h.move);
    }
  }
  return null;
}

export function useXiangqiGame(config: GameConfig = {}) {
  const cfgRef = useRef(config);
  cfgRef.current = config;

  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState());
  const [aiThinking, setAiThinking] = useState(false);
  const [revealingOpponentMove, setRevealingOpponentMove] = useState(false);
  const [lastOpponentMoveText, setLastOpponentMoveText] = useState<string | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardRef = useRef(state.board);
  boardRef.current = state.board;
  const historyRef = useRef(state.history);
  historyRef.current = state.history;
  const revealingRef = useRef(revealingOpponentMove);
  revealingRef.current = revealingOpponentMove;

  const clearReveal = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setRevealingOpponentMove(false);
  }, []);

  const startOpponentReveal = useCallback(
    (boardBefore: Board, move: Move) => {
      const cfg = cfgRef.current;
      if (!cfg.aiSide) return;
      const revealMs = cfg.revealOpponentMoveMs ?? 1200;
      const text = Coach.describeMove(boardBefore, move);
      setLastOpponentMoveText(text);
      clearReveal();
      if (revealMs <= 0) return;
      setRevealingOpponentMove(true);
      revealTimerRef.current = setTimeout(() => {
        revealTimerRef.current = null;
        setRevealingOpponentMove(false);
      }, revealMs);
    },
    [clearReveal],
  );

  const { board, turn, selected, targets, lastMove, history, status, hintMove } = state;

  const checkSide = X.inCheck(board, turn) ? turn : null;
  const checkPos = checkSide ? X.findGeneral(board, checkSide) : null;

  const captured: Record<Side, PieceType[]> = { r: [], b: [] };
  history.forEach((h) => {
    if (h.capturedType) captured[h.side].push(h.capturedType);
  });

  const applyAndAdvance = useCallback((move: Move, extras?: { aiComment?: string }) => {
    const cfg = cfgRef.current;
    const prevBoard = boardRef.current;
    const mover = prevBoard[move.from[0]][move.from[1]];
    if (!mover) return;

    const capturedPiece = prevBoard[move.to[0]][move.to[1]];
    const side = mover.s;
    const nb = X.applyMove(prevBoard, move);
    const next = X.opp(side);
    const st = X.gameStatus(nb, next);

    cfg.onMove?.(move, prevBoard, side, {
      captured: capturedPiece ? capturedPiece.t : null,
      gaveCheck: X.inCheck(nb, next),
      status: st,
      aiComment: extras?.aiComment,
      history: historyRef.current.map((h) => ({
        side: h.side,
        from: h.move.from,
        to: h.move.to,
      })),
    });

    dispatch({ type: 'APPLY_MOVE', move });

    if (cfg.aiSide && side === cfg.aiSide) {
      startOpponentReveal(prevBoard, move);
    }
  }, [startOpponentReveal]);

  const onPoint = useCallback(
    (r: number, c: number) => {
      const cfg = cfgRef.current;
      if (status) return;
      if (cfg.locked) return;
      if (revealingRef.current) return;

      if (r >= 0) {
        const p = board[r][c];
        const humanCanMove = (side: Side) => !cfg.aiSide || side !== cfg.aiSide;
        if (selected) {
          const t = targets.find((m) => m.to[0] === r && m.to[1] === c);
          if (t) {
            applyAndAdvance(t);
            return;
          }
        }
        if (p && p.s === turn && humanCanMove(p.s)) {
          dispatch({ type: 'POINT', r, c, locked: cfg.locked, aiSide: cfg.aiSide });
          cfg.onSelect?.(p, X.movesFrom(board, r, c).length, [r, c]);
          return;
        }
      }
      dispatch({ type: 'POINT', r, c, locked: cfg.locked, aiSide: cfg.aiSide });
    },
    [board, turn, selected, targets, status, applyAndAdvance],
  );

  useEffect(() => {
    const cfg = cfgRef.current;
    if (!cfg.aiSide || status || turn !== cfg.aiSide) return;

    let cancelled = false;
    const difficulty = cfg.difficulty ?? 'intermediate';
    const provider = cfg.aiProvider ?? 'engine';
    const aiSide = cfg.aiSide;

    const runLocal = () => {
      const move = AI.chooseMove(board, aiSide, difficulty);
      if (move) applyAndAdvance(move);
    };

    const finishThinking = () => {
      if (!cancelled) {
        setAiThinking(false);
        cfg.onAIThinking?.(false);
      }
    };

    setAiThinking(true);
    cfg.onAIThinking?.(true);

    const thinkMs =
      cfg.aiThinkDelayMs ?? Math.round(900 + Math.random() * 500);
    const minDelay = new Promise<void>((r) => setTimeout(r, thinkMs));

    (async () => {
      if (provider === 'local') {
        await minDelay;
        if (cancelled) return;
        finishThinking();
        runLocal();
        return;
      }

      const historyPayload = history.map((h) => ({
        side: h.side,
        from: h.move.from,
        to: h.move.to,
      }));
      const moveParams = {
        board,
        side: aiSide,
        difficulty,
        lastMove: lastMove ?? undefined,
        history: historyPayload,
      };

      try {
        const fetchMove =
          provider === 'engine'
            ? () => fetchEngineMove(moveParams)
            : () => fetchAiMove(moveParams);
        const [result] = await Promise.all([fetchMove(), minDelay]);
        if (cancelled) return;
        finishThinking();
        if (result.move) {
          applyAndAdvance(result.move, {
            aiComment: result.comment,
          });
        }
      } catch (err) {
        if (cancelled) return;
        const quiet =
          (err instanceof GemmaApiError && isGemmaUnconfigured(err)) ||
          (err instanceof GemmaApiError && isPikafishUnconfigured(err));
        if (!quiet) {
          console.warn(`[${provider}] opponent move failed, using local AI:`, err);
        }
        await minDelay;
        if (cancelled) return;
        finishThinking();
        runLocal();
      }
    })();

    return () => {
      cancelled = true;
      setAiThinking(false);
      cfg.onAIThinking?.(false);
    };
  }, [turn, board, status, lastMove, history, applyAndAdvance]);

  const reset = useCallback(
    (startBoard?: Board) => {
      dispatch({ type: 'RESET', startBoard });
      setAiThinking(false);
      clearReveal();
      setLastOpponentMoveText(null);
    },
    [clearReveal],
  );

  const undoLast = useCallback(
    (count = 1) => {
      dispatch({ type: 'UNDO', count });
      setAiThinking(false);
      clearReveal();
      const cfg = cfgRef.current;
      const keep = Math.max(0, state.history.length - count);
      const trimmed = state.history.slice(0, keep);
      setLastOpponentMoveText(
        cfg.aiSide ? lastAiMoveText(trimmed, cfg.aiSide) : null,
      );
    },
    [clearReveal, state.history],
  );

  const showHint = useCallback(
    (depth = 2) => {
      const h = Coach.hint(board, turn, depth);
      if (h.move) dispatch({ type: 'SET_HINT', move: { from: h.move.from, to: h.move.to } });
      return h;
    },
    [board, turn],
  );

  const revealHint = useCallback((move: Move) => {
    dispatch({ type: 'SET_HINT', move: { from: move.from, to: move.to } });
  }, []);

  const clearHint = useCallback(() => dispatch({ type: 'SET_HINT', move: null }), []);

  const aiSide = config.aiSide;
  let computerLastMove: { from: Coord; to: Coord } | null = null;
  if (aiSide) {
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (h.side === aiSide) {
        computerLastMove = {
          from: [...h.move.from],
          to: [...h.move.to],
        };
        break;
      }
    }
  }

  useEffect(() => () => clearReveal(), [clearReveal]);

  return {
    board,
    turn,
    selected,
    targets,
    lastMove,
    computerLastMove,
    history,
    status,
    aiThinking,
    revealingOpponentMove,
    lastOpponentMoveText,
    hint: hintMove,
    checkPos,
    checkSide,
    captured,
    onPoint,
    applyAndAdvance,
    reset,
    undoLast,
    showHint,
    revealHint,
    clearHint,
    setBoard: (b: Board) => dispatch({ type: 'RESET', startBoard: b }),
    setTurn: () => {},
  };
}
