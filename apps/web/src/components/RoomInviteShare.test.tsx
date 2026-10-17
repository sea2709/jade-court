import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomInviteShare } from './RoomInviteShare';

const writeText = vi.fn().mockResolvedValue(undefined);

const defaultLink = 'http://localhost/multiplayer?room=JADE-ABCD';
const defaultCode = 'JADE-ABCD';

function installWebShare(options: {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
  omitShare?: boolean;
  omitCanShare?: boolean;
}) {
  const share = options.share ?? vi.fn().mockResolvedValue(undefined);
  const canShare =
    options.canShare ?? vi.fn((data?: ShareData) => Boolean(data?.url && data.url === defaultLink));

  if (options.omitShare) {
    Object.assign(navigator, {
      share: undefined,
      canShare: options.omitCanShare ? undefined : canShare,
    });
  } else if (options.omitCanShare) {
    Object.assign(navigator, { share, canShare: undefined });
  } else {
    Object.assign(navigator, { share, canShare });
  }
  return { share, canShare };
}

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText },
  });
  writeText.mockClear();
  installWebShare({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RoomInviteShare', () => {
  it('renders JADE prefix and four letter boxes', () => {
    render(
      <RoomInviteShare code="JADE-WXYZ" inviteLink="http://localhost/multiplayer?room=JADE-WXYZ" />,
    );
    expect(screen.getByText('JADE–')).toBeInTheDocument();
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
    installWebShare({ omitShare: true, omitCanShare: true });
    render(<RoomInviteShare code={defaultCode} inviteLink={defaultLink} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(defaultLink);
    expect(screen.getByRole('button', { name: '✓ Copied' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenLastCalledWith('ABCD');
    expect(screen.getAllByRole('button', { name: '✓ Copied' })).toHaveLength(2);
  });

  it('shows Share invite when navigator.share and canShare({ url }) succeed', () => {
    render(<RoomInviteShare code={defaultCode} inviteLink={defaultLink} />);
    expect(screen.getByRole('button', { name: 'Share invite' })).toBeInTheDocument();
  });

  it('hides Share invite when navigator.share is missing', () => {
    installWebShare({ omitShare: true });
    render(<RoomInviteShare code={defaultCode} inviteLink={defaultLink} />);
    expect(screen.queryByRole('button', { name: 'Share invite' })).not.toBeInTheDocument();
  });

  it('hides Share invite when canShare returns false', () => {
    installWebShare({ canShare: vi.fn().mockReturnValue(false) });
    render(<RoomInviteShare code={defaultCode} inviteLink={defaultLink} />);
    expect(screen.queryByRole('button', { name: 'Share invite' })).not.toBeInTheDocument();
  });

  it('calls navigator.share with invite link and room code in text', async () => {
    const link = 'http://localhost/multiplayer?room=JADE-WXYZ';
    const { share, canShare } = installWebShare({
      canShare: vi.fn((data?: ShareData) => data?.url === link),
    });
    render(<RoomInviteShare code="JADE-WXYZ" inviteLink={link} />);
    expect(canShare).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Share invite' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Play Xiangqi with me',
      text: 'Join my Jade Court room JADE-WXYZ',
      url: link,
    });
  });

  it('ignores AbortError and does not copy fallback', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    installWebShare({ share });
    render(<RoomInviteShare code={defaultCode} inviteLink={defaultLink} />);
    await userEvent.click(screen.getByRole('button', { name: 'Share invite' }));
    await waitFor(() => {
      expect(share).toHaveBeenCalled();
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText("Couldn't share — use Copy link")).not.toBeInTheDocument();
  });

  it('shows ✓ Copied on Share invite when share fails and copy fallback succeeds', async () => {
    const share = vi.fn().mockRejectedValue(new Error('share failed'));
    installWebShare({ share });
    render(<RoomInviteShare code={defaultCode} inviteLink={defaultLink} />);
    await userEvent.click(screen.getByRole('button', { name: 'Share invite' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '✓ Copied' })).toBeInTheDocument();
    });
    expect(writeText).toHaveBeenCalledWith(defaultLink);
  });

  it('shows failure message when share and copy both fail', async () => {
    const share = vi.fn().mockRejectedValue(new Error('share failed'));
    writeText.mockRejectedValue(new Error('clipboard denied'));
    installWebShare({ share });
    render(<RoomInviteShare code={defaultCode} inviteLink={defaultLink} />);
    await userEvent.click(screen.getByRole('button', { name: 'Share invite' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent("Couldn't share — use Copy link");
    });
  });

  it('disables Share invite while share is pending and re-enables after settle', async () => {
    let resolveShare!: () => void;
    const share = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveShare = resolve;
        }),
    );
    installWebShare({ share });
    render(<RoomInviteShare code={defaultCode} inviteLink={defaultLink} />);
    const shareBtn = screen.getByRole('button', { name: 'Share invite' });
    await userEvent.click(shareBtn);
    expect(shareBtn).toBeDisabled();
    resolveShare();
    await waitFor(() => {
      expect(shareBtn).not.toBeDisabled();
    });
  });
});
