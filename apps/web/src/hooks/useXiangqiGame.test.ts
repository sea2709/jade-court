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
  });
});
