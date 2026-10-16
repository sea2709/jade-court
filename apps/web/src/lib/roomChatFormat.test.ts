import { describe, expect, it } from 'vitest';
import { chatSenderLabel, formatSystemChatLine, groupChatRows } from './roomChatFormat';

describe('roomChatFormat', () => {
  it('labels senders with names and (you)', () => {
    expect(chatSenderLabel('r', 'r', 'Minh', 'Lan')).toBe('Minh (you)');
    expect(chatSenderLabel('b', 'r', 'Minh', 'Lan')).toBe('Lan');
    expect(chatSenderLabel('b', 'b', null, null)).toBe('Black player (you)');
  });

  it('words system lines with seat names', () => {
    const joined = formatSystemChatLine(
      { kind: 'system', id: '1', event: 'joined', side: 'b', createdAt: 0 },
      'Minh',
      'Lan',
    );
    expect(joined).toBe('Lan joined the room');

    const resigned = formatSystemChatLine(
      { kind: 'system', id: '2', event: 'resigned', side: 'r', createdAt: 0 },
      'Minh',
      'Lan',
    );
    expect(resigned).toBe('Minh resigned — Lan wins');
  });

  it('groups consecutive messages within two minutes', () => {
    const groups = groupChatRows(
      [
        { kind: 'message', id: 'a', side: 'r', text: 'one', createdAt: 1000 },
        { kind: 'message', id: 'b', side: 'r', text: 'two', createdAt: 1100 },
        {
          kind: 'system',
          id: 's',
          event: 'joined',
          side: 'b',
          createdAt: 1200,
        },
        { kind: 'message', id: 'c', side: 'b', text: 'hey', createdAt: 1300 },
      ],
      'r',
      'Minh',
      'Lan',
    );
    expect(groups).toHaveLength(3);
    expect(groups[0].kind === 'messages' && groups[0].items).toHaveLength(2);
    expect(groups[1].kind).toBe('system');
  });
});
