import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CoachAskInput } from './CoachAskInput';

describe('CoachAskInput', () => {
  it('disables Send until a question is typed', async () => {
    render(<CoachAskInput onAsk={() => {}} />);
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('Ask Master Lin…'), '   ');
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('Ask Master Lin…'), 'Why?');
    expect(send).toBeEnabled();
  });

  it('submits the trimmed question and clears the input', async () => {
    const onAsk = vi.fn();
    render(<CoachAskInput onAsk={onAsk} />);
    const input = screen.getByPlaceholderText('Ask Master Lin…');
    await userEvent.type(input, '  What now?  {Enter}');
    expect(onAsk).toHaveBeenCalledExactlyOnceWith('What now?');
    expect(input).toHaveValue('');
  });

  it('does not submit while disabled', async () => {
    const onAsk = vi.fn();
    render(<CoachAskInput onAsk={onAsk} disabled />);
    expect(screen.getByPlaceholderText('Ask Master Lin…')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(onAsk).not.toHaveBeenCalled();
  });
});
