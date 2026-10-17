import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PlayScreen } from './PlayScreen';

describe('PlayScreen setup', () => {
  it('renders level cards as interactive cards with link-style names', () => {
    render(<PlayScreen />);
    for (const name of ['Beginner', 'Intermediate', 'Advanced']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toHaveClass(
        'level-card',
        'card-interactive',
      );
      expect(screen.getByText(name)).toHaveClass('card-title-link');
    }
  });

  it('marks the clicked level card as selected', async () => {
    render(<PlayScreen />);
    const beginner = screen.getByRole('button', { name: /Beginner/ });
    const intermediate = screen.getByRole('button', { name: /Intermediate/ });
    expect(intermediate).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(beginner);

    expect(beginner).toHaveAttribute('aria-pressed', 'true');
    expect(beginner).toHaveClass('level-card-active');
    expect(intermediate).toHaveAttribute('aria-pressed', 'false');
  });
});
