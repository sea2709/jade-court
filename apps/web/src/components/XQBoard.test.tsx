import { X } from '@jade-court/xiangqi-engine';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { XQBoard } from './XQBoard';

const square = (container: HTMLElement, rc: string) =>
  container.querySelector<HTMLElement>(`[data-square="${rc}"]`);

describe('XQBoard', () => {
  it('renders all 32 pieces with their characters', () => {
    const { container } = render(<XQBoard board={X.initialBoard()} />);
    expect(container.querySelectorAll('[data-piece]')).toHaveLength(32);
    expect(square(container, '9-4')).toHaveTextContent(X.CHAR.r.G);
    expect(square(container, '0-4')).toHaveTextContent(X.CHAR.b.G);
  });

  it('reports board coordinates when a piece is clicked', () => {
    const onPoint = vi.fn();
    const { container } = render(<XQBoard board={X.initialBoard()} onPoint={onPoint} />);
    fireEvent.click(square(container, '7-1')!);
    expect(onPoint).toHaveBeenCalledExactlyOnceWith(7, 1);
  });

  it('renders clickable hit targets on empty destination squares', () => {
    const onPoint = vi.fn();
    const board = X.initialBoard();
    const targets = X.movesFrom(board, 7, 1);
    const { container } = render(
      <XQBoard board={board} selected={[7, 1]} targets={targets} onPoint={onPoint} />,
    );
    expect(square(container, '7-1')).toHaveClass('selected');
    fireEvent.click(square(container, '7-4')!);
    expect(onPoint).toHaveBeenCalledExactlyOnceWith(7, 4);
  });

  it('clears selection when the empty board is clicked', () => {
    const onPoint = vi.fn();
    render(<XQBoard board={X.initialBoard()} onPoint={onPoint} />);
    fireEvent.click(screen.getByTestId('board'));
    expect(onPoint).toHaveBeenCalledWith(-1, -1);
  });

  it('does not report piece clicks when not interactive', () => {
    const onPoint = vi.fn();
    const { container } = render(
      <XQBoard board={X.initialBoard()} onPoint={onPoint} interactive={false} />,
    );
    fireEvent.click(square(container, '7-1')!);
    expect(onPoint).not.toHaveBeenCalledWith(7, 1);
    expect(square(container, '7-1')).not.toHaveClass('clickable');
  });

  it('flips the board so Black is at the bottom', () => {
    const top = (el: HTMLElement | null) => parseFloat(el!.parentElement!.style.top);
    const { container, rerender } = render(<XQBoard board={X.initialBoard()} />);
    expect(top(square(container, '9-4'))).toBeGreaterThan(top(square(container, '0-4')));

    rerender(<XQBoard board={X.initialBoard()} flip />);
    expect(top(square(container, '9-4'))).toBeLessThan(top(square(container, '0-4')));
  });

  it('highlights a general in check', () => {
    const { container } = render(<XQBoard board={X.initialBoard()} checkPos={[9, 4]} />);
    expect(square(container, '9-4')).toHaveClass('incheck');
  });
});
