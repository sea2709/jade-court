import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GameOverCard } from './GameOverCard';

describe('GameOverCard', () => {
  it('shows a win by checkmate', () => {
    render(<GameOverCard status="checkmate" won onRematch={() => {}} />);
    expect(screen.getByRole('heading', { name: 'You win!' })).toBeInTheDocument();
    expect(screen.getByText('Checkmate on the board.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change level' })).not.toBeInTheDocument();
  });

  it('shows a loss by stalemate', () => {
    render(<GameOverCard status="stalemate" won={false} onRematch={() => {}} />);
    expect(screen.getByRole('heading', { name: 'You lose' })).toBeInTheDocument();
    expect(screen.getByText(/Stalemate/)).toBeInTheDocument();
  });

  it('wires up the rematch and menu buttons', async () => {
    const onRematch = vi.fn();
    const onMenu = vi.fn();
    render(<GameOverCard status="checkmate" won onRematch={onRematch} onMenu={onMenu} />);
    await userEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    await userEvent.click(screen.getByRole('button', { name: 'Change level' }));
    expect(onRematch).toHaveBeenCalledOnce();
    expect(onMenu).toHaveBeenCalledOnce();
  });
});
