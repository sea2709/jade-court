import { AI, Coach, X } from '@jade-court/xiangqi-engine';
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
import { useCallback, useEffect, useRef, useState } from 'react';

export interface MoveMeta {
  captured: PieceType | null;
  gaveCheck: boolean;
  status: GameStatus;
}

export interface GameConfig {
  aiSide?: Side;
  difficulty?: Difficulty;
  locked?: boolean;
  onMove?: (move: Move, boardBefore: Board, side: Side, meta: MoveMeta) => void;
  onSelect?: (piece: Piece, count: number, pos: Coord) => void;
  onAIThinking?: (thinking: boolean) => void;
}

export function useXiangqiGame(config: GameConfig = {}) {
  const cfgRef = useRef(config);
  cfgRef.current = config;

  const [board, setBoard] = useState<Board>(() => X.initialBoard());
  const [turn, setTurn] = useState<Side>('r');
  const [selected, setSelected] = useState<Coord | null>(null);
  const [targets, setTargets] = useState<Move[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Coord; to: Coord } | null>(null);
  const [history, setHistory] = useState<
    { move: Move; side: Side; capturedType: PieceType | null }[]
  >([]);
  const [status, setStatus] = useState<GameStatus>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [hintMove, setHintMove] = useState<{ from: Coord; to: Coord } | null>(null);

  const checkSide = X.inCheck(board, turn) ? turn : null;
  const checkPos = checkSide ? X.findGeneral(board, checkSide) : null;

  const captured: Record<Side, PieceType[]> = { r: [], b: [] };
  history.forEach((h) => {
    if (h.capturedType) captured[h.side].push(h.capturedType);
  });

  const applyAndAdvance = useCallback((move: Move) => {
    setBoard((prevBoard) => {
      const mover = prevBoard[move.from[0]][move.from[1]];
      if (!mover) return prevBoard;
      const capturedPiece = prevBoard[move.to[0]][move.to[1]];
      const boardBefore = prevBoard;
      const nb = X.applyMove(prevBoard, move);
      const side = mover.s;
      const next = X.opp(side);
      const st = X.gameStatus(nb, next);

      cfgRef.current.onMove?.(move, boardBefore, side, {
        captured: capturedPiece ? capturedPiece.t : null,
        gaveCheck: X.inCheck(nb, next),
        status: st,
      });

      setHistory((h) => [...h, { move, side, capturedType: capturedPiece?.t ?? null }]);
      setLastMove({ from: move.from, to: move.to });
      setTurn(next);
      setStatus(st);
      setSelected(null);
      setTargets([]);
      setHintMove(null);
      return nb;
    });
  }, []);

  const onPoint = useCallback(
    (r: number, c: number) => {
      if (status) return;
      const cfg = cfgRef.current;
      if (cfg.locked) return;
      if (r < 0) {
        setSelected(null);
        setTargets([]);
        return;
      }
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
        setSelected([r, c]);
        const mv = X.movesFrom(board, r, c);
        setTargets(mv);
        setHintMove(null);
        cfg.onSelect?.(p, mv.length, [r, c]);
        return;
      }
      setSelected(null);
      setTargets([]);
    },
    [board, turn, selected, targets, status, applyAndAdvance],
  );

  useEffect(() => {
    const cfg = cfgRef.current;
    if (!cfg.aiSide || status || turn !== cfg.aiSide) return;
    let cancelled = false;
    setAiThinking(true);
    cfg.onAIThinking?.(true);
    const delay = 380 + Math.random() * 520;
    const id = setTimeout(() => {
      if (cancelled) return;
      const move = AI.chooseMove(board, cfg.aiSide!, cfg.difficulty ?? 'intermediate');
      setAiThinking(false);
      cfg.onAIThinking?.(false);
      if (move) applyAndAdvance(move);
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(id);
      setAiThinking(false);
    };
  }, [turn, board, status, applyAndAdvance]);

  const reset = useCallback((startBoard?: Board) => {
    setBoard(startBoard ? X.cloneBoard(startBoard) : X.initialBoard());
    setTurn('r');
    setSelected(null);
    setTargets([]);
    setLastMove(null);
    setHistory([]);
    setStatus(null);
    setHintMove(null);
    setAiThinking(false);
  }, []);

  const undoLast = useCallback((count = 1) => {
    setHistory((h) => {
      const keep = Math.max(0, h.length - count);
      let b = X.initialBoard();
      for (let i = 0; i < keep; i++) b = X.applyMove(b, h[i].move);
      setBoard(b);
      const lastSide = keep > 0 ? h[keep - 1].side : null;
      setTurn(lastSide ? X.opp(lastSide) : 'r');
      setLastMove(keep > 0 ? { from: h[keep - 1].move.from, to: h[keep - 1].move.to } : null);
      setStatus(null);
      setSelected(null);
      setTargets([]);
      setHintMove(null);
      return h.slice(0, keep);
    });
  }, []);

  const showHint = useCallback(
    (depth = 2) => {
      const h = Coach.hint(board, turn, depth);
      if (h.move) setHintMove({ from: h.move.from, to: h.move.to });
      return h;
    },
    [board, turn],
  );

  const clearHint = useCallback(() => setHintMove(null), []);

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
    setBoard,
    setTurn,
  };
}
