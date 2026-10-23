import { AI, Coach, X } from '@jade-court/xiangqi-engine';
import {
  fetchAiMove,
  fetchOpponentMove,
  GemmaApiError,
  isAuthRequired,
  isLlmUnconfigured,
  isPlayAccessRequired,
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
  /** Set when the AI move came from the LLM with commentary. */
  aiComment?: string;
  /** Plies before this move (for coach / LLM context). */
  history?: { side: Side; from: Coord; to: Coord }[];
}

export type AiProvider = 'llm' | 'server' | 'local';

/** Saved move plies replayed once at hook mount (see `buildStateFromInitialMoves`). */
export type InitialMovePlies = { from: Coord; to: Coord }[];

export interface GameConfig {
  aiSide?: Side;
  difficulty?: Difficulty;
  /**
   * Legal plies from the start position, applied once at mount (no `onMove`).
   * Read only on first hook init — not updated if the config changes later.
   * Do not combine with `aiSide`: if replay leaves `turn === aiSide`, the opponent
   * effect may run immediately on mount.
   */
  initialMoves?: InitialMovePlies;
  /** `llm` = Learn (/api/ai/move); `server` = Play (/api/opponent/move, server env); `local` = in-browser negamax. */
  aiProvider?: AiProvider;
  /** Minimum delay before the AI plays (ms). Default ~900–1400 random. */
  aiThinkDelayMs?: number;
  /** Pause after an AI ply so the move is easier to notice (ms). Default 1200; 0 = off. */
  revealOpponentMoveMs?: number;
  locked?: boolean;
  /** Optional LLM model id for `aiProvider: 'llm'`. */
  modelId?: string;
  /** When AI move fails with 401/402 instead of falling back to local AI. */
  onGatedError?: (kind: 'auth' | 'access') => void;
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
  /**
   * Plies taken back via UNDO that the player may replay with REDO.
   * Stored chronologically with each UNDO batch appended at the END so the
   * most recently removed plies are at the tail — same convention as `history`.
   * Cleared on APPLY_MOVE (a new move branches the line) and on RESET.
   */
  redoStack: HistoryEntry[];
  status: GameStatus;
  hintMove: { from: Coord; to: Coord } | null;
}

type GameAction =
  | { type: 'POINT'; r: number; c: number; locked?: boolean; aiSide?: Side }
  | { type: 'APPLY_MOVE'; move: Move }
  | { type: 'UNDO'; count: number }
  | { type: 'REDO'; count: number }
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
    redoStack: [],
    status: null,
    hintMove: null,
  };
}

function isIntegerCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

function isOnBoard(r: number, c: number): boolean {
  return r >= 0 && r <= 9 && c >= 0 && c <= 8;
}

/**
 * Replays saved plies from the standard start through `APPLY_MOVE` logic.
 * Returns a fresh start state when any ply is illegal or follows game over.
 */
export function buildStateFromInitialMoves(moves: InitialMovePlies): {
  state: GameState;
  rejected: boolean;
} {
  let state = initialGameState();
  for (const ply of moves) {
    if (state.status) {
      return { state: initialGameState(), rejected: true };
    }
    const from = ply.from;
    const to = ply.to;
    if (
      !Array.isArray(from) ||
      !Array.isArray(to) ||
      from.length !== 2 ||
      to.length !== 2 ||
      !isIntegerCoord(from[0]) ||
      !isIntegerCoord(from[1]) ||
      !isIntegerCoord(to[0]) ||
      !isIntegerCoord(to[1]) ||
      !isOnBoard(from[0], from[1]) ||
      !isOnBoard(to[0], to[1])
    ) {
      return { state: initialGameState(), rejected: true };
    }
    const [fr, fc] = from;
    const [tr, tc] = to;
    const mover = state.board[fr][fc];
    if (!mover || mover.s !== state.turn) {
      return { state: initialGameState(), rejected: true };
    }
    const legal = X.movesFrom(state.board, fr, fc);
    const match = legal.find((m) => m.to[0] === tr && m.to[1] === tc);
    if (!match) {
      return { state: initialGameState(), rejected: true };
    }
    state = gameReducer(state, { type: 'APPLY_MOVE', move: match });
  }
  return { state, rejected: false };
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
        // A new move after a take-back branches the line; the previous
        // redoStack no longer represents reachable positions.
        redoStack: [],
      };
    }
    case 'UNDO': {
      const keep = Math.max(0, state.history.length - action.count);
      const board = keep > 0 ? X.cloneBoard(state.history[keep].boardBefore) : X.initialBoard();
      const lastEntry = keep > 0 ? state.history[keep - 1] : null;
      const turn = lastEntry ? X.opp(lastEntry.side) : 'r';
      // Slice(keep) already returns the removed entries in chronological order
      // (history[keep] is the FIRST removed ply and is older than history[keep+1]).
      // Appending at the END keeps the stack chronological with the latest
      // UNDO batch at the tail — REDO's `slice(stack.length - n)` will read
      // them in the same order they were originally played.
      const removed = state.history.slice(keep);
      return {
        board,
        turn,
        selected: null,
        targets: [],
        lastMove: lastEntry ? { from: [...lastEntry.move.from], to: [...lastEntry.move.to] } : null,
        history: state.history.slice(0, keep),
        status: keep > 0 ? X.gameStatus(board, turn) : null,
        hintMove: null,
        redoStack: [...state.redoStack, ...removed],
      };
    }
    case 'REDO': {
      // Clamp to the available plies. The caller typically passes the same
      // `count` they previously passed to UNDO; an under-request is treated
      // as a safe no-op for the missing plies (we replay what's available).
      const req = Math.max(0, Math.floor(action.count));
      const replayCount = Math.min(req, state.redoStack.length);
      if (replayCount === 0) return state;
      // Take from the tail in stack-order: these are the latest `replayCount`
      // plies, in the chronological order they were originally played within
      // their UNDO batch. Their first entry's `boardBefore` matches `state.board`.
      const reapply = state.redoStack.slice(state.redoStack.length - replayCount);
      const remaining = state.redoStack.slice(0, state.redoStack.length - replayCount);
      // Re-compute board/turn/lastMove/status through the same apply logic
      // as APPLY_MOVE. The full replay happens inside one dispatch so React
      // never observes an intermediate state (in particular, never a state
      // with `turn === aiSide`) — the effect that fires opponent moves
      // would otherwise run for those intermediate frames.
      let board = X.cloneBoard(state.board);
      let lastApplied = reapply[0]!;
      for (const entry of reapply) {
        board = X.applyMove(board, entry.move);
        lastApplied = entry;
      }
      const turn = X.opp(lastApplied.side);
      return {
        board,
        turn,
        selected: null,
        targets: [],
        lastMove: { from: [...lastApplied.move.from], to: [...lastApplied.move.to] },
        history: [...state.history, ...reapply],
        status: X.gameStatus(board, turn),
        hintMove: null,
        redoStack: remaining,
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
  const initialMoveList = config.initialMoves;

  const [initialMovesRejected] = useState(() => {
    if (!initialMoveList?.length) return false;
    return buildStateFromInitialMoves(initialMoveList).rejected;
  });

  const [state, dispatch] = useReducer(gameReducer, undefined, () => {
    if (!initialMoveList?.length) return initialGameState();
    const built = buildStateFromInitialMoves(initialMoveList);
    return built.rejected ? initialGameState() : built.state;
  });
  const [aiThinking, setAiThinking] = useState(false);
  const [revealingOpponentMove, setRevealingOpponentMove] = useState(false);
  const [lastOpponentMoveText, setLastOpponentMoveText] = useState<string | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardRef = useRef(state.board);
  const historyRef = useRef(state.history);
  const revealingRef = useRef(revealingOpponentMove);

  useEffect(() => {
    cfgRef.current = config;
  }, [config]);

  useEffect(() => {
    boardRef.current = state.board;
    historyRef.current = state.history;
  }, [state.board, state.history]);

  useEffect(() => {
    revealingRef.current = revealingOpponentMove;
  }, [revealingOpponentMove]);

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

  const { board, turn, selected, targets, lastMove, history, redoStack, status, hintMove } = state;

  const checkSide = X.inCheck(board, turn) ? turn : null;
  const checkPos = checkSide ? X.findGeneral(board, checkSide) : null;

  const captured: Record<Side, PieceType[]> = { r: [], b: [] };
  history.forEach((h) => {
    if (h.capturedType) captured[h.side].push(h.capturedType);
  });

  const applyAndAdvance = useCallback(
    (move: Move, extras?: { aiComment?: string }) => {
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
    },
    [startOpponentReveal],
  );

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
    const provider = cfg.aiProvider ?? 'server';
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

    const thinkMs = cfg.aiThinkDelayMs ?? Math.round(900 + Math.random() * 500);
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
        ...(cfg.modelId ? { modelId: cfg.modelId } : {}),
      };

      try {
        const fetchMove =
          provider === 'server'
            ? () => fetchOpponentMove(moveParams)
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
        if (provider === 'llm' && err instanceof GemmaApiError) {
          if (isAuthRequired(err)) {
            cfg.onGatedError?.('auth');
            finishThinking();
            return;
          }
          if (isPlayAccessRequired(err)) {
            cfg.onGatedError?.('access');
            finishThinking();
            return;
          }
        }
        const quiet = err instanceof GemmaApiError && isLlmUnconfigured(err);
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
      setLastOpponentMoveText(cfg.aiSide ? lastAiMoveText(trimmed, cfg.aiSide) : null);
    },
    [clearReveal, state.history],
  );

  /**
   * Redo previously taken-back plies. Replays `count` plies from `redoStack`
   * in a single dispatch (atomic) — no intermediate React state with
   * `turn === aiSide`, so the opponent-move effect never fires. Never calls
   * `onMove` and never issues an opponent API call. Safe no-op when there
   * are fewer than `count` plies on the stack.
   */
  const redoLast = useCallback(
    (count = 1) => {
      const safeCount = Math.max(0, Math.floor(count));
      const replayCount = Math.min(safeCount, state.redoStack.length);
      if (replayCount === 0) return;
      const reapply = state.redoStack.slice(state.redoStack.length - replayCount);
      dispatch({ type: 'REDO', count: safeCount });
      setAiThinking(false);
      clearReveal();
      const cfg = cfgRef.current;
      // Restore the "Computer's last move" card from the restored history.
      // Search the EXTENDED history so we prefer the just-redone opponent
      // reply (if any) over older ones.
      if (cfg.aiSide) {
        setLastOpponentMoveText(lastAiMoveText([...state.history, ...reapply], cfg.aiSide));
      }
    },
    [clearReveal, state.history, state.redoStack],
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
    /** True when `initialMoves` was present but failed validation at mount. */
    initialMovesRejected,
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
    redoLast,
    /** Number of plies currently on the redo stack — pair-aligned (even) in Play. */
    redoCount: redoStack.length,
    showHint,
    revealHint,
    clearHint,
    setBoard: (b: Board) => dispatch({ type: 'RESET', startBoard: b }),
    setTurn: () => {},
  };
}
