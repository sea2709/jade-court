import { describe, expect, it } from 'vitest';
import {
  CHAT_HISTORY_CAP,
  CHAT_MAX_TEXT_LENGTH,
  addChatEntry,
  createChatRateLimiter,
  newMessageEntry,
  newSystemEntry,
  postPlayerChat,
  validateChatText,
} from './chat.js';
import { createRoom, getRoom, joinRoom } from './rooms.js';

describe('validateChatText', () => {
  it('trims surrounding whitespace', () => {
    expect(validateChatText('  hello  ')).toEqual({ ok: true, text: 'hello' });
  });

  it('rejects empty and whitespace-only text', () => {
    expect(validateChatText('')).toEqual({ ok: false, error: 'empty' });
    expect(validateChatText('   \t\n')).toEqual({ ok: false, error: 'empty' });
  });

  it('accepts 500 characters and rejects 501', () => {
    const ok = 'a'.repeat(500);
    expect(validateChatText(ok)).toEqual({ ok: true, text: ok });
    expect(validateChatText('a'.repeat(501))).toEqual({ ok: false, error: 'too_long' });
  });
});

describe('postPlayerChat authorization', () => {
  it('rejects unknown rooms and guests who are not seated', () => {
    const limiter = createChatRateLimiter();
    expect(postPlayerChat(undefined, 'g1', 'hi', limiter)).toEqual({
      ok: false,
      error: 'not_a_player',
      text: 'hi',
    });
    const room = createRoom('host');
    expect(postPlayerChat(room, 'stranger', 'hi', limiter)).toEqual({
      ok: false,
      error: 'not_a_player',
      text: 'hi',
    });
  });

  it('allows only the room red or black guest to post', () => {
    const limiter = createChatRateLimiter();
    const host = 'red-guest';
    const guest = 'black-guest';
    const room = createRoom(host);
    joinRoom(room.code, guest);
    const loaded = getRoom(room.code)!;

    const res = postPlayerChat(loaded, host, 'hello', limiter);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.entry).toMatchObject({ kind: 'message', side: 'r', text: 'hello' });
      expect(res.entry).not.toHaveProperty('guestId');
    }
  });
});

describe('chat entries', () => {
  it('never includes guestId on message or system entries', () => {
    const msg = newMessageEntry('r', 'x');
    const sys = newSystemEntry('joined', 'b');
    expect(msg).not.toHaveProperty('guestId');
    expect(sys).not.toHaveProperty('guestId');
    expect(JSON.stringify(msg)).not.toContain('guestId');
    expect(JSON.stringify(sys)).not.toContain('guestId');
  });

  it('assigns unique ids and the correct side', () => {
    const a = newMessageEntry('b', 'one');
    const b = newMessageEntry('b', 'two');
    expect(a.id).not.toBe(b.id);
    expect(a.side).toBe('b');
  });
});

describe('addChatEntry cap', () => {
  it('drops the oldest entries after 100 including system lines', () => {
    const room = createRoom('host');
    for (let i = 0; i < CHAT_HISTORY_CAP; i++) {
      addChatEntry(room, newMessageEntry('r', `m${i}`));
    }
    expect(room.chat).toHaveLength(CHAT_HISTORY_CAP);
    addChatEntry(room, newSystemEntry('joined', 'b'));
    expect(room.chat).toHaveLength(CHAT_HISTORY_CAP);
    expect(room.chat![0].kind).toBe('message');
    expect((room.chat![0] as { text: string }).text).toBe('m1');
    expect(room.chat!.at(-1)?.kind).toBe('system');
  });
});

describe('chat rate limiter', () => {
  it('allows five messages in the window, rejects the sixth, then allows after the window', () => {
    let now = 0;
    const limiter = createChatRateLimiter(() => now);
    const room = createRoom('host');
    const code = room.code;

    for (let i = 0; i < 5; i++) {
      expect(limiter.tryConsume(code, 'r')).toBe(true);
    }
    expect(limiter.tryConsume(code, 'r')).toBe(false);

    now = 5001;
    expect(limiter.tryConsume(code, 'r')).toBe(true);
  });

  it('shares the limit across two logical sockets for the same player seat', () => {
    const now = 0;
    const limiter = createChatRateLimiter(() => now);
    const room = createRoom('host');
    const code = room.code;

    for (let i = 0; i < 3; i++) expect(limiter.tryConsume(code, 'r')).toBe(true);
    for (let i = 0; i < 2; i++) expect(limiter.tryConsume(code, 'r')).toBe(true);
    expect(limiter.tryConsume(code, 'r')).toBe(false);
  });
});

describe('CHAT_MAX_TEXT_LENGTH', () => {
  it('matches the documented 500-character limit', () => {
    expect(CHAT_MAX_TEXT_LENGTH).toBe(500);
  });
});
