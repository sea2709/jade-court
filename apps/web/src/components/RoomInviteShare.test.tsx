import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomInviteShare } from './RoomInviteShare';

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText },
  });
  writeText.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RoomInviteShare', () => {
  it('renders JADE prefix and four letter boxes', () => {
    render(
      <RoomInviteShare code="JADE-WXYZ" inviteLink="http://localhost/multiplayer?room=JADE-WXYZ" />,
    );
    expect(screen.getByText('J A D E –')).toBeInTheDocument();
    expect(screen.getAllByTestId('invite-code-char')).toHaveLength(4);
    expect(screen.getAllByTestId('invite-code-char').map((el) => el.textContent)).toEqual([
      'W',
      'X',
      'Y',
      'Z',
    ]);
    expect(screen.queryByText('JADE-WXYZ')).not.toBeInTheDocument();
  });

  it('copies link and code with confirmation labels', async () => {
    render(
      <RoomInviteShare code="JADE-ABCD" inviteLink="http://localhost/multiplayer?room=JADE-ABCD" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith('http://localhost/multiplayer?room=JADE-ABCD');
    expect(screen.getByRole('button', { name: '✓ Copied' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenLastCalledWith('JADE-ABCD');
    expect(screen.getAllByRole('button', { name: '✓ Copied' })).toHaveLength(2);
  });
});
