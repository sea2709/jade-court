import { X, type Coord } from '@jade-court/xiangqi-engine';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeDemoBoard } from './HomeDemoBoard';
import { HOME_DEMO_STORAGE_KEY, serializeHomeDemoSave } from '../lib/homeDemoStorage';
import checkmateFixture from '../test/fixtures/home-demo-checkmate.json';
import stalemateFixture from '../test/fixtures/home-demo-stalemate.json';

const square = (container: HTMLElement, rc: string) =>
  container.querySelector<HTMLElement>(`[data-square="${rc}"]`);

describe('HomeDemoBoard', () => {
  it('shows Red to move on a fresh board', () => {
    render(<HomeDemoBoard />);
    expect(screen.getByTestId('home-demo-turn')).toHaveTextContent('Red 帥 to move');
    expect(screen.getByTestId('home-demo-restart')).toBeDisabled();
  });

  it('selecting a piece shows legal targets and alternates sides', () => {
    const { container } = render(<HomeDemoBoard />);
    fireEvent.click(square(container, '7-1')!);
    expect(square(container, '7-1')).toHaveClass('selected');
    expect(container.querySelectorAll('.point')).not.toHaveLength(0);

    fireEvent.click(square(container, '7-4')!);
    expect(screen.getByTestId('home-demo-turn')).toHaveTextContent('Black 將 to move');

    fireEvent.click(square(container, '0-1')!);
    fireEvent.click(square(container, '2-2')!);
    expect(screen.getByTestId('home-demo-turn')).toHaveTextContent('Red 帥 to move');
  });

  it('deselects when the selected piece is clicked again', () => {
    const { container } = render(<HomeDemoBoard />);
    fireEvent.click(square(container, '7-1')!);
    fireEvent.click(square(container, '7-1')!);
    expect(square(container, '7-1')).not.toHaveClass('selected');
  });

  it('persists moves to localStorage and clears on restart', () => {
    const { container } = render(<HomeDemoBoard />);
    fireEvent.click(square(container, '7-1')!);
    fireEvent.click(square(container, '7-4')!);
    expect(localStorage.getItem(HOME_DEMO_STORAGE_KEY)).toContain('"v":1');

    fireEvent.click(screen.getByTestId('home-demo-restart'));
    expect(localStorage.getItem(HOME_DEMO_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('home-demo-restart')).toBeDisabled();
  });

  it('shows Check! and highlights the general when the side to move is in check', () => {
    const inCheckPlies = (
      checkmateFixture as { from: [number, number]; to: [number, number] }[]
    ).slice(0, 11) as { from: Coord; to: Coord }[];
    localStorage.setItem(HOME_DEMO_STORAGE_KEY, serializeHomeDemoSave(inCheckPlies));
    const { container } = render(<HomeDemoBoard />);
    expect(screen.getByText('Check!')).toBeInTheDocument();
    expect(container.querySelector('.incheck')).toBeTruthy();
  });

  it('highlights the last move after restore', () => {
    const moves: { from: Coord; to: Coord }[] = [
      { from: [7, 1], to: [7, 4] },
      { from: [0, 1], to: [2, 2] },
    ];
    localStorage.setItem(HOME_DEMO_STORAGE_KEY, serializeHomeDemoSave(moves));
    const { container } = render(<HomeDemoBoard />);
    expect(container.querySelectorAll('.last-dot')).toHaveLength(2);
  });

  it('restores a mid-game position from localStorage', () => {
    const moves: { from: Coord; to: Coord }[] = [
      { from: [7, 1], to: [7, 4] },
      { from: [0, 1], to: [2, 2] },
    ];
    localStorage.setItem(HOME_DEMO_STORAGE_KEY, serializeHomeDemoSave(moves));
    const { container } = render(<HomeDemoBoard />);
    expect(screen.getByTestId('home-demo-turn')).toHaveTextContent('Red 帥 to move');
    expect(square(container, '7-4')).toHaveTextContent(X.CHAR.r.C);
    expect(square(container, '2-2')).toHaveTextContent(X.CHAR.b.H);
  });

  it('shows the checkmate overlay after restoring a finished game', () => {
    localStorage.setItem(HOME_DEMO_STORAGE_KEY, JSON.stringify({ v: 1, moves: checkmateFixture }));
    render(<HomeDemoBoard />);
    expect(screen.getByTestId('home-demo-game-over')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Red wins!' })).toBeInTheDocument();
    expect(screen.getByText('Checkmate!')).toBeInTheDocument();
  });

  it('shows the stalemate overlay after restoring a finished game', () => {
    localStorage.setItem(HOME_DEMO_STORAGE_KEY, JSON.stringify({ v: 1, moves: stalemateFixture }));
    render(<HomeDemoBoard />);
    expect(screen.getByTestId('home-demo-game-over')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Red wins!' })).toBeInTheDocument();
    expect(screen.getByText('Stalemate — no legal moves.')).toBeInTheDocument();
  });

  it('play again clears storage and resets the board', () => {
    localStorage.setItem(HOME_DEMO_STORAGE_KEY, JSON.stringify({ v: 1, moves: checkmateFixture }));
    render(<HomeDemoBoard />);
    fireEvent.click(screen.getByTestId('home-demo-play-again'));
    expect(localStorage.getItem(HOME_DEMO_STORAGE_KEY)).toBeNull();
    expect(screen.queryByTestId('home-demo-game-over')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-demo-turn')).toHaveTextContent('Red 帥 to move');
  });

  it('persists and restores after an illegal-but-valid save is cleared on mount', () => {
    localStorage.setItem(
      HOME_DEMO_STORAGE_KEY,
      JSON.stringify({ v: 1, moves: [{ from: [7, 1], to: [0, 0] }] }),
    );
    const { container, unmount } = render(<HomeDemoBoard />);
    expect(localStorage.getItem(HOME_DEMO_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('home-demo-turn')).toHaveTextContent('Red 帥 to move');

    fireEvent.click(square(container, '7-1')!);
    fireEvent.click(square(container, '7-4')!);
    expect(localStorage.getItem(HOME_DEMO_STORAGE_KEY)).toContain('"v":1');

    unmount();
    const { container: container2 } = render(<HomeDemoBoard />);
    expect(screen.getByTestId('home-demo-turn')).toHaveTextContent('Black 將 to move');
    expect(square(container2, '7-4')).toHaveTextContent(X.CHAR.r.C);
    expect(container2.querySelectorAll('.last-dot')).toHaveLength(2);
  });

  it('drops corrupt saved data without logging', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(HOME_DEMO_STORAGE_KEY, '{not json');
    render(<HomeDemoBoard />);
    expect(localStorage.getItem(HOME_DEMO_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('home-demo-turn')).toHaveTextContent('Red 帥 to move');
    expect(err).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    err.mockRestore();
    warn.mockRestore();
  });

  it('survives localStorage.setItem throwing', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { container } = render(<HomeDemoBoard />);
    fireEvent.click(square(container, '7-1')!);
    fireEvent.click(square(container, '7-4')!);
    expect(screen.getByTestId('home-demo-turn')).toHaveTextContent('Black 將 to move');
    setItem.mockRestore();
  });
});
