import { X } from '@jade-court/xiangqi-engine';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useXiangqiGame, type GameConfig } from './useXiangqiGame';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function setup(config: GameConfig = {}) {
  return renderHook(() => useXiangqiGame(config));
}

/** Red's central cannon opening: cannon [7,1] -> [7,4]. */
function playCentralCannon(result: ReturnType<typeof setup>['result']) {
  act(() => result.current.onPoint(7, 1));
  act(() => result.current.onPoint(7, 4));
}

describe('useXiangqiGame: two-player (no AI)', () => {
  it('starts from the initial position with Red to move', () => {
    const { result } = setup();
    expect(result.current.board).toEqual(X.initialBoard());
    expect(result.current.turn).toBe('r');
    expect(result.current.status).toBeNull();
  });

  it('selecting a piece shows its legal targets', () => {
    const onSelect = vi.fn();
    const { result } = setup({ onSelect });
    act(() => result.current.onPoint(7, 1));
    expect(result.current.selected).toEqual([7, 1]);
    expect(result.current.targets).toEqual(X.movesFrom(X.initialBoard(), 7, 1));
    expect(onSelect).toHaveBeenCalledWith(
      { t: 'C', s: 'r' },
      result.current.targets.length,
      [7, 1],
    );
  });

  it('clicking the selected piece again clears the selection', () => {
    const { result } = setup();
    act(() => result.current.onPoint(7, 1));
    act(() => result.current.onPoint(7, 1));
    expect(result.current.selected).toBeNull();
    expect(result.current.targets).toEqual([]);
  });

  it('a legal move updates the board, turn, and history', () => {
    const onMove = vi.fn();
    const { result } = setup({ onMove });
    playCentralCannon(result);
    expect(result.current.board[7][4]).toEqual({ t: 'C', s: 'r' });
    expect(result.current.board[7][1]).toBeNull();
    expect(result.current.turn).toBe('b');
    expect(result.current.history).toHaveLength(1);
    expect(result.current.lastMove).toEqual({ from: [7, 1], to: [7, 4] });
    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({ from: [7, 1], to: [7, 4] }),
      X.initialBoard(),
      'r',
      expect.objectContaining({ captured: null, gaveCheck: false, status: null }),
    );
  });

  it('ignores an illegal destination and opponent pieces', () => {
    const { result } = setup();
    act(() => result.current.onPoint(7, 1));
    act(() => result.current.onPoint(5, 5));
    expect(result.current.board).toEqual(X.initialBoard());
    expect(result.current.selected).toBeNull();

    act(() => result.current.onPoint(0, 1));
    expect(result.current.selected).toBeNull();
    expect(result.current.turn).toBe('r');
  });

  it('does not accept input when locked', () => {
    const { result } = setup({ locked: true });
    act(() => result.current.onPoint(7, 1));
    expect(result.current.selected).toBeNull();
  });

  it('undo and reset restore earlier positions', () => {
    const { result } = setup();
    playCentralCannon(result);
    act(() => result.current.undoLast(1));
    expect(result.current.board).toEqual(X.initialBoard());
    expect(result.current.turn).toBe('r');

    playCentralCannon(result);
    act(() => result.current.reset());
    expect(result.current.history).toEqual([]);
    expect(result.current.board).toEqual(X.initialBoard());
  });

  it('showHint returns an engine move and highlights it', () => {
    const { result } = setup();
    let hint: ReturnType<typeof result.current.showHint> | undefined;
    act(() => {
      hint = result.current.showHint(1);
    });
    expect(hint?.move).not.toBeNull();
    expect(result.current.hint).toEqual({ from: hint!.move!.from, to: hint!.move!.to });
    act(() => result.current.clearHint());
    expect(result.current.hint).toBeNull();
  });
});

describe('useXiangqiGame: vs computer', () => {
  const aiConfig: GameConfig = {
    aiSide: 'b',
    aiProvider: 'server',
    difficulty: 'beginner',
    aiThinkDelayMs: 0,
    revealOpponentMoveMs: 0,
  };

  it('does not let the human move the computer’s pieces', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { result } = setup(aiConfig);
    playCentralCannon(result);
    act(() => result.current.onPoint(0, 1));
    expect(result.current.selected).toBeNull();
  });

  it('applies the opponent move returned by the server', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [0, 1], to: [2, 2] }, source: 'engine' }));
    const { result } = setup(aiConfig);
    playCentralCannon(result);

    await waitFor(() => expect(result.current.turn).toBe('r'));
    expect(result.current.board[2][2]).toEqual({ t: 'H', s: 'b' });
    expect(result.current.computerLastMove).toEqual({ from: [0, 1], to: [2, 2] });
    expect(result.current.lastOpponentMoveText).toBe('Horse advances.');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/opponent/move');
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({
      side: 'b',
      difficulty: 'beginner',
      lastMove: { from: [7, 1], to: [7, 4] },
    });
  });

  it('falls back to the local engine when the server request fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error('network down'));
    const { result } = setup(aiConfig);
    playCentralCannon(result);

    await waitFor(() => expect(result.current.turn).toBe('r'));
    expect(result.current.history).toHaveLength(2);
    expect(result.current.history[1]!.side).toBe('b');
    expect(warn).toHaveBeenCalled();
  });

  it('falls back quietly when the LLM is not configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValue(json({ error: 'llm_unconfigured' }, 503));
    const { result } = setup({ ...aiConfig, aiProvider: 'llm' });
    playCentralCannon(result);

    await waitFor(() => expect(result.current.turn).toBe('r'));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/ai/move');
    expect(warn).not.toHaveBeenCalled();
  });

  it('plays first when the computer is Red', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [7, 1], to: [7, 4] }, source: 'engine' }));
    const { result } = setup({ ...aiConfig, aiSide: 'r' });
    await waitFor(() => expect(result.current.turn).toBe('b'));
    expect(result.current.board[7][4]).toEqual({ t: 'C', s: 'r' });
  });

  it('take-back of two plies returns to the human’s turn', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [0, 1], to: [2, 2] }, source: 'engine' }));
    const { result } = setup(aiConfig);
    playCentralCannon(result);
    await waitFor(() => expect(result.current.history).toHaveLength(2));

    act(() => result.current.undoLast(2));
    expect(result.current.board).toEqual(X.initialBoard());
    expect(result.current.turn).toBe('r');
    expect(result.current.lastOpponentMoveText).toBeNull();
    expect(result.current.redoCount).toBe(2);
  });
});

describe('useXiangqiGame: redo', () => {
  const aiConfig: GameConfig = {
    aiSide: 'b',
    aiProvider: 'server',
    difficulty: 'beginner',
    aiThinkDelayMs: 0,
    revealOpponentMoveMs: 0,
  };
  /**
   * Play one human+computer pair, then wait for the FULL pair to land in
   * history. `history.length > before` resolves as soon as the human move
   * lands (length 1 > 0), so we explicitly wait for `targetLength` so tests
   * can capture board/turn/history without racing the opponent fetch.
   */
  async function playComputerRound(
    result: ReturnType<typeof setup>['result'],
    targetLength: number,
    reply: { from: [number, number]; to: [number, number] } = { from: [0, 1], to: [2, 2] },
  ) {
    const before = result.current.history.length;
    fetchMock.mockResolvedValue(json({ move: reply, source: 'engine' }));
    playCentralCannon(result);
    await waitFor(() => expect(result.current.history.length).toBe(targetLength));
    // Sanity check: the player move plus the awaited AI reply are both in.
    expect(result.current.history.length).toBe(before + 2);
  }

  it('UNDO pushes the removed plies onto the redo stack', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [0, 1], to: [2, 2] }, source: 'engine' }));
    const { result } = setup(aiConfig);

    expect(result.current.redoCount).toBe(0);
    playCentralCannon(result);
    await waitFor(() => expect(result.current.history).toHaveLength(2));
    expect(result.current.redoCount).toBe(0);

    act(() => result.current.undoLast(2));
    expect(result.current.redoCount).toBe(2);
  });

  it('REDO restores board, turn, lastMove, status, and move count exactly', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [0, 1], to: [2, 2] }, source: 'engine' }));
    const { result } = setup(aiConfig);
    playCentralCannon(result);
    await waitFor(() => expect(result.current.history).toHaveLength(2));

    const beforeBoard = X.cloneBoard(result.current.board) as ReturnType<typeof X.cloneBoard>;
    const beforeTurn = result.current.turn;
    const beforeLastMove = result.current.lastMove;
    const beforeStatus = result.current.status;
    const beforeComputerLastMove = result.current.computerLastMove;
    const beforeOpponentText = result.current.lastOpponentMoveText;

    act(() => result.current.undoLast(2));
    expect(result.current.redoCount).toBe(2);

    act(() => result.current.redoLast(2));
    expect(result.current.board).toEqual(beforeBoard);
    expect(result.current.turn).toBe(beforeTurn);
    expect(result.current.lastMove).toEqual(beforeLastMove);
    expect(result.current.status).toBe(beforeStatus);
    expect(result.current.computerLastMove).toEqual(beforeComputerLastMove);
    expect(result.current.lastOpponentMoveText).toBe(beforeOpponentText);
    expect(result.current.history).toHaveLength(2);
    expect(result.current.redoCount).toBe(0);
  });

  it('round-trips N× undoLast(2) then N× redoLast(2) back to the original position', async () => {
    const { result } = setup(aiConfig);

    // Two human+computer pairs total (4 plies). Different human moves so we
    // actually reach the second pair (the cannon target square would be
    // empty otherwise).
    await playComputerRound(result, 2);
    fetchMock.mockResolvedValue(json({ move: { from: [2, 1], to: [3, 1] }, source: 'engine' }));
    act(() => result.current.onPoint(9, 1));
    act(() => result.current.onPoint(7, 2));
    await waitFor(() => expect(result.current.history).toHaveLength(4));
    expect(result.current.history).toHaveLength(4);

    const original = {
      board: X.cloneBoard(result.current.board) as ReturnType<typeof X.cloneBoard>,
      turn: result.current.turn,
      history: [...result.current.history],
    };

    // Two consecutive undos.
    act(() => result.current.undoLast(2));
    act(() => result.current.undoLast(2));
    expect(result.current.history).toHaveLength(0);
    expect(result.current.turn).toBe('r');
    expect(result.current.redoCount).toBe(4);

    // Two consecutive redos replay the most recent batch first.
    act(() => result.current.redoLast(2));
    act(() => result.current.redoLast(2));
    expect(result.current.board).toEqual(original.board);
    expect(result.current.turn).toBe(original.turn);
    expect(result.current.history).toHaveLength(4);
    expect(result.current.redoCount).toBe(0);
  });

  it('a new human move after take-back clears the redo stack', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [0, 1], to: [2, 2] }, source: 'engine' }));
    const { result } = setup(aiConfig);
    await playComputerRound(result, 2);

    act(() => result.current.undoLast(2));
    expect(result.current.redoCount).toBe(2);

    // Any new human move after a take-back branches the line: the previously
    // restored plies are no longer reachable, so the stack must reset.
    await playComputerRound(result, 2);
    expect(result.current.redoCount).toBe(0);
  });

  it('RESET clears the redo stack', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [0, 1], to: [2, 2] }, source: 'engine' }));
    const { result } = setup(aiConfig);
    await playComputerRound(result, 2);
    act(() => result.current.undoLast(2));
    expect(result.current.redoCount).toBe(2);

    act(() => result.current.reset());
    expect(result.current.redoCount).toBe(0);
    expect(result.current.history).toHaveLength(0);
    expect(result.current.board).toEqual(X.initialBoard());
  });

  it('REDO makes zero opponent API calls and replays the original reply verbatim', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [0, 1], to: [2, 2] }, source: 'engine' }));
    const { result } = setup(aiConfig);
    await playComputerRound(result, 2);
    const callsAfterFirstReply = fetchMock.mock.calls.length;
    const originalComputerReply = result.current.history[1]!;

    act(() => result.current.undoLast(2));
    expect(result.current.lastOpponentMoveText).toBeNull();

    act(() => result.current.redoLast(2));
    // No new opponent fetch was issued by the redo.
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirstReply);
    // The restored computer reply equals the original one (same from/to/side).
    expect(result.current.history[1]!.move.from).toEqual(originalComputerReply.move.from);
    expect(result.current.history[1]!.move.to).toEqual(originalComputerReply.move.to);
    expect(result.current.history[1]!.side).toBe(originalComputerReply.side);
    // And the "Computer's last move" card text is restored.
    expect(result.current.lastOpponentMoveText).toBe('Horse advances.');
    // After redo, it is the human's turn — the opponent effect must not fire.
    expect(result.current.turn).toBe('r');
    expect(result.current.aiThinking).toBe(false);
  });

  it('REDO is a safe no-op when fewer plies are stacked than requested', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [0, 1], to: [2, 2] }, source: 'engine' }));
    const { result } = setup(aiConfig);
    await playComputerRound(result, 2);

    // Capture the post-pair state (the position REDO will restore).
    const targetBoard = X.cloneBoard(result.current.board) as ReturnType<typeof X.cloneBoard>;
    const targetTurn = result.current.turn;

    act(() => result.current.undoLast(2));
    expect(result.current.redoCount).toBe(2);

    // Ask for more plies than are on the stack — should clamp and replay what we have.
    act(() => result.current.redoLast(5));
    expect(result.current.history).toHaveLength(2);
    expect(result.current.redoCount).toBe(0);
    expect(result.current.board).toEqual(targetBoard);
    expect(result.current.turn).toBe(targetTurn);
  });

  it('REDOs ZERO plies when the stack is empty (safe no-op)', async () => {
    const { result } = setup(aiConfig);
    expect(result.current.redoCount).toBe(0);
    fetchMock.mockClear();
    act(() => result.current.redoLast(2));
    expect(result.current.history).toHaveLength(0);
    expect(result.current.redoCount).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discards in-flight opponent requests when UNDO is called mid-fetch', async () => {
    let resolveOpponent: (resp: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveOpponent = resolve;
      }),
    );
    const { result } = setup(aiConfig);
    playCentralCannon(result); /* opponent fetch is now pending (deferred). */

    // Take back while the opponent's first reply is still in flight.
    act(() => result.current.undoLast(2));
    expect(result.current.history).toHaveLength(0);
    expect(result.current.turn).toBe('r');

    // Late delivery of the opponent's original reply must NOT be applied —
    // the cancelled-cleanup in the opponent effect short-circuits it.
    await act(async () => {
      resolveOpponent(json({ move: { from: [0, 1], to: [2, 2] }, source: 'engine' }));
    });
    expect(result.current.history).toHaveLength(0);
    expect(result.current.board[7][4]).toBeNull(); /* human cannon still at [7,1] */
    expect(result.current.board[7][1]).toEqual({ t: 'C', s: 'r' });
    expect(result.current.turn).toBe('r');
  });

  it('does not let the opponent effect fire when REDO leaves turn on the human', async () => {
    fetchMock.mockResolvedValue(json({ move: { from: [0, 1], to: [2, 2] }, source: 'engine' }));
    const { result } = setup(aiConfig);
    await playComputerRound(result, 2);
    const callsBeforeUndo = fetchMock.mock.calls.length;

    act(() => result.current.undoLast(2));
    act(() => result.current.redoLast(2));

    // Give a microtask flush: if the opponent effect had fired it would have
    // incremented fetchMock (one synchronous poll is enough; the fetch is
    // mocked to resolve immediately).
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBe(callsBeforeUndo);
    });
    expect(result.current.turn).toBe('r');
    expect(result.current.aiThinking).toBe(false);
  });
});
