import { AI, Coach, X } from '@jade-court/xiangqi-engine';
import { fetchAiMove, GemmaApiError, isGemmaUnconfigured } from '../lib/gemmaApi';
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
}

export type AiProvider = 'gemma' | 'local';

export interface GameConfig {
  aiSide?: Side;
  difficulty?: Difficulty;
  /** Gemma via server when available; falls back to local negamax on 503/errors. */
  aiProvider?: AiProvider;
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

export function useXiangqiGame(config: GameConfig = {}) {
  const cfgRef = useRef(config);
  cfgRef.current = config;

  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState());
  const [aiThinking, setAiThinking] = useState(false);
  const boardRef = useRef(state.board);
  boardRef.current = state.board;

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
    });

    dispatch({ type: 'APPLY_MOVE', move });
  }, []);

  const onPoint = useCallback(
    (r: number, c: number) => {
      const cfg = cfgRef.current;
      if (status) return;
      if (cfg.locked) return;

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
    const provider = cfg.aiProvider ?? 'gemma';
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

    const minDelay = new Promise<void>((r) => setTimeout(r, 380 + Math.random() * 520));

    (async () => {
      if (provider === 'local') {
        await minDelay;
        if (cancelled) return;
        finishThinking();
        runLocal();
        return;
      }

      try {
        const historyPayload = history.map((h) => ({
          side: h.side,
          from: h.move.from,
          to: h.move.to,
        }));
        const [result] = await Promise.all([
          fetchAiMove({
            board,
            side: aiSide,
            difficulty,
            lastMove: lastMove ?? undefined,
            history: historyPayload,
          }),
          minDelay,
        ]);
        if (cancelled) return;
        finishThinking();
        if (result.move) {
          applyAndAdvance(result.move, {
            aiComment: result.comment,
          });
        }
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof GemmaApiError) || !isGemmaUnconfigured(err)) {
          console.warn('[gemma] fetchAiMove failed, using local AI:', err);
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

  const reset = useCallback((startBoard?: Board) => {
    dispatch({ type: 'RESET', startBoard });
    setAiThinking(false);
  }, []);

  const undoLast = useCallback((count = 1) => {
    dispatch({ type: 'UNDO', count });
    setAiThinking(false);
  }, []);

  const showHint = useCallback(
    (depth = 2) => {
      const h = Coach.hint(board, turn, depth);
      if (h.move) dispatch({ type: 'SET_HINT', move: { from: h.move.from, to: h.move.to } });
      return h;
    },
    [board, turn],
  );

  const clearHint = useCallback(() => dispatch({ type: 'SET_HINT', move: null }), []);

  return {
    board,
    turn,
    selected,
    targets,
    lastMove,
    history,
    status,
    aiThinking,
    hint: hintMove,
    checkPos,
    checkSide,
    captured,
    onPoint,
    applyAndAdvance,
    reset,
    undoLast,
    showHint,
    clearHint,
    setBoard: (b: Board) => dispatch({ type: 'RESET', startBoard: b }),
    setTurn: () => {},
  };
}
