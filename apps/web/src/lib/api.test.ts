import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoom, getRoom, joinRoom, wsUrl } from './api';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  localStorage.setItem('jade-court-guest-id', 'guest-123');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('room API client', () => {
  it('createRoom POSTs with the guest id header', async () => {
    fetchMock.mockResolvedValue(json({ code: 'JADE-ABCD', room: {} }));
    await expect(createRoom()).resolves.toMatchObject({ code: 'JADE-ABCD' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/rooms');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'x-guest-id': 'guest-123',
      'Content-Type': 'application/json',
    });
  });

  it('joinRoom URL-encodes the room code', async () => {
    fetchMock.mockResolvedValue(json({ side: 'b', room: {} }));
    await joinRoom('JADE/1');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/rooms/JADE%2F1/join');
  });

  it('throws the server error message on failure', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Room is full' }, 400));
    await expect(joinRoom('JADE-ABCD')).rejects.toThrow('Room is full');
  });

  it('falls back to the status text when the server sends no error', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404, statusText: 'Not Found' }));
    await expect(getRoom('JADE-ABCD')).rejects.toThrow('Not Found');
  });
});

describe('wsUrl', () => {
  it('derives ws:// from the page origin', () => {
    expect(wsUrl()).toBe(`ws://${location.host}/ws`);
  });

  it('uses wss:// on https pages', () => {
    vi.stubGlobal('location', { protocol: 'https:', host: 'jade.example' });
    expect(wsUrl()).toBe('wss://jade.example/ws');
  });

  it('prefers VITE_WS_URL when set', () => {
    vi.stubEnv('VITE_WS_URL', 'ws://api.example/ws');
    expect(wsUrl()).toBe('ws://api.example/ws');
  });
});
