/**
 * Labels and system-line copy for in-room chat (names from room view, not payloads).
 */
import type { Side } from '@jade-court/xiangqi-engine';
import { opponentSeatLabel, seatLabel } from './displayName';
import type { ChatEntry, DisplayChatRow } from './roomChatTypes';
import { ROOM_CHAT_GROUP_MS } from './roomChatTypes';

export function chatSenderLabel(
  side: Side,
  viewerSide: Side,
  redName: string | null,
  blackName: string | null,
): string {
  const base = seatLabel(side, redName, blackName);
  return side === viewerSide ? `${base} (you)` : base;
}

export function formatSystemChatLine(
  entry: Extract<ChatEntry, { kind: 'system' }>,
  redName: string | null,
  blackName: string | null,
): string {
  const actor = seatLabel(entry.side, redName, blackName);
  switch (entry.event) {
    case 'joined':
      return `${actor} joined the room`;
    case 'resigned': {
      const winnerSide: Side = entry.side === 'r' ? 'b' : 'r';
      const winner = seatLabel(winnerSide, redName, blackName);
      return `${actor} resigned — ${winner} wins`;
    }
    case 'checkmate': {
      const winner = seatLabel(entry.side, redName, blackName);
      return `Checkmate — ${winner} wins`;
    }
    case 'stalemate': {
      const winner = seatLabel(entry.side, redName, blackName);
      return `Stalemate — ${winner} wins`;
    }
    default:
      return actor;
  }
}

export function formatChatTime(createdAt: number): string {
  const d = new Date(createdAt);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function chatEmptyHint(
  viewerSide: Side,
  opponentJoined: boolean,
  redName: string | null,
  blackName: string | null,
): string {
  if (!opponentJoined) return 'Say hi to your opponent';
  const name = opponentSeatLabel(viewerSide, redName, blackName);
  return `Say hi to ${name}`;
}

export function chatRejectionMessage(error: string): string {
  switch (error) {
    case 'rate_limited':
      return "You're sending messages too fast. Wait a few seconds and try again.";
    case 'too_long':
      return 'Message is too long (500 characters max).';
    case 'empty':
      return 'Message cannot be empty.';
    case 'not_a_player':
      return 'Only seated players can chat.';
    default:
      return 'Could not send message.';
  }
}

export type ChatMessageGroup =
  | { kind: 'system'; id: string; text: string }
  | {
      kind: 'messages';
      side: Side;
      label: string;
      time: string;
      items: { id: string; text: string; pending?: boolean; mine: boolean }[];
    };

export function groupChatRows(
  rows: DisplayChatRow[],
  viewerSide: Side,
  redName: string | null,
  blackName: string | null,
): ChatMessageGroup[] {
  const groups: ChatMessageGroup[] = [];
  let current: ChatMessageGroup | null = null;

  for (const row of rows) {
    if (row.kind === 'system') {
      current = null;
      groups.push({
        kind: 'system',
        id: row.id,
        text: formatSystemChatLine(row, redName, blackName),
      });
      continue;
    }

    const side = row.side;
    const mine = side === viewerSide;
    const pending = row.kind === 'pending';
    const createdAt = row.createdAt;
    const lastInGroup = current && current.kind === 'messages' ? current.items.at(-1) : undefined;
    const lastRow = lastInGroup
      ? rows.find((r) => (r.kind === 'message' || r.kind === 'pending') && r.id === lastInGroup.id)
      : undefined;
    const lastTime =
      lastRow && (lastRow.kind === 'message' || lastRow.kind === 'pending') ? lastRow.createdAt : 0;
    const joinGroup =
      current &&
      current.kind === 'messages' &&
      current.side === side &&
      createdAt - lastTime < ROOM_CHAT_GROUP_MS;

    if (!joinGroup) {
      current = {
        kind: 'messages',
        side,
        label: chatSenderLabel(side, viewerSide, redName, blackName),
        time: formatChatTime(createdAt),
        items: [{ id: row.id, text: row.text, pending, mine }],
      };
      groups.push(current);
    } else if (current !== null && current.kind === 'messages') {
      current.items.push({ id: row.id, text: row.text, pending, mine });
    }
  }

  return groups;
}

/** Latest player message text for collapsed preview (not system lines). */
export function latestPlayerMessageText(rows: DisplayChatRow[]): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.kind === 'message' || row.kind === 'pending') return row.text;
  }
  return null;
}
