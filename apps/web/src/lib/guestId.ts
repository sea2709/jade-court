const KEY = 'jade-court-guest-id';

export function getGuestId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function apiHeaders(): HeadersInit {
  return { 'x-guest-id': getGuestId(), 'Content-Type': 'application/json' };
}
