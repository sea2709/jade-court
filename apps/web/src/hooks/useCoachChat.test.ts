import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createCoachMessage, useCoachChat } from './useCoachChat';

describe('createCoachMessage', () => {
  it('assigns increasing ids', () => {
    const a = createCoachMessage('coach', { text: 'a' });
    const b = createCoachMessage('player', { text: 'b' });
    expect(b.id).toBeGreaterThan(a.id);
    expect(b).toMatchObject({ from: 'player', text: 'b' });
  });
});

describe('useCoachChat', () => {
  it('starts with the initial messages', () => {
    const initial = [createCoachMessage('coach', { text: 'Welcome' })];
    const { result } = renderHook(() => useCoachChat(initial));
    expect(result.current.messages).toEqual(initial);
  });

  it('pushes coach, player, and system messages in order', () => {
    const { result } = renderHook(() => useCoachChat());
    act(() => {
      result.current.pushCoach({ text: 'Hi' });
      result.current.pushPlayer({ text: 'Hello' });
      result.current.pushSys('Game started');
    });
    expect(result.current.messages.map((m) => [m.from, m.text])).toEqual([
      ['coach', 'Hi'],
      ['player', 'Hello'],
      ['system', 'Game started'],
    ]);
  });

  it('streams tokens into a thinking message and clears the thinking flag', () => {
    const { result } = renderHook(() => useCoachChat());
    let id = 0;
    act(() => {
      id = result.current.pushCoach({ think: true });
    });
    act(() => {
      result.current.appendToMessage(id, 'Good ');
      result.current.appendToMessage(id, 'move');
    });
    expect(result.current.messages[0]).toMatchObject({ text: 'Good move', think: false });

    act(() => result.current.replaceMessage(id, { text: 'Replaced', label: 'Great' }));
    expect(result.current.messages[0]).toMatchObject({ text: 'Replaced', label: 'Great' });
  });

  it('aborts the previous stream when a new signal is requested', () => {
    const { result } = renderHook(() => useCoachChat());
    const first = result.current.newAbortSignal();
    const second = result.current.newAbortSignal();
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
  });

  it('resetMessages replaces messages and aborts in-flight streams', () => {
    const { result } = renderHook(() => useCoachChat());
    const signal = result.current.newAbortSignal();
    act(() => {
      result.current.pushPlayer({ text: 'old' });
    });
    act(() => result.current.resetMessages([]));
    expect(result.current.messages).toEqual([]);
    expect(signal.aborted).toBe(true);
  });

  it('aborts in-flight streams on unmount', () => {
    const { result, unmount } = renderHook(() => useCoachChat());
    const signal = result.current.newAbortSignal();
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
