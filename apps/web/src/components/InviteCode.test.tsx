import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { InviteCodeBoxes, InviteCodeInput } from './InviteCode';

function ControlledInput({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <InviteCodeInput value={value} onChange={setValue} />;
}

const boxText = () => screen.getAllByTestId('invite-code-char').map((el) => el.textContent);

describe('InviteCodeBoxes', () => {
  it('always renders four boxes, leaving missing slots empty', () => {
    render(<InviteCodeBoxes chars="AB" />);
    expect(screen.getByText('JADE–')).toBeInTheDocument();
    expect(boxText()).toEqual(['A', 'B', '', '']);
  });
});

describe('InviteCodeInput', () => {
  it('uppercases typed characters into the boxes and stops at four', async () => {
    render(<ControlledInput />);
    const input = screen.getByLabelText('Invite code');
    await userEvent.type(input, 'kp5q9');
    expect(input).toHaveValue('KP5Q');
    expect(boxText()).toEqual(['K', 'P', '5', 'Q']);
  });

  it('keeps only the suffix when a full code is pasted', () => {
    render(<ControlledInput />);
    const input = screen.getByLabelText('Invite code');
    fireEvent.change(input, { target: { value: 'JADE-L7Q5' } });
    expect(input).toHaveValue('L7Q5');
  });

  it('highlights the next empty box while focused', async () => {
    render(<ControlledInput initial="AB" />);
    const boxes = screen.getAllByTestId('invite-code-char');
    expect(boxes.some((b) => b.classList.contains('invite-code-char-active'))).toBe(false);
    await userEvent.click(screen.getByLabelText('Invite code'));
    expect(boxes[2]).toHaveClass('invite-code-char-active');
    await userEvent.tab();
    expect(boxes[2]).not.toHaveClass('invite-code-char-active');
  });
});
