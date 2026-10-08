import { describe, expect, it } from 'vitest';
import { apiHeaders, getGuestId } from './guestId';

describe('getGuestId', () => {
  it('creates an id once and reuses it from localStorage', () => {
    const first = getGuestId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(localStorage.getItem('jade-court-guest-id')).toBe(first);
    expect(getGuestId()).toBe(first);
  });

  it('keeps an existing stored id', () => {
    localStorage.setItem('jade-court-guest-id', 'stored-guest');
    expect(getGuestId()).toBe('stored-guest');
  });
});

describe('apiHeaders', () => {
  it('includes the guest id and JSON content type', () => {
    localStorage.setItem('jade-court-guest-id', 'g-1');
    expect(apiHeaders()).toEqual({ 'x-guest-id': 'g-1', 'Content-Type': 'application/json' });
  });
});
