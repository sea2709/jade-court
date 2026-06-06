import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatMessagePatch } from '../components/coach/types';

let nextMsgId = 0;

export function createCoachMessage(
  from: ChatMessage['from'],
  patch: ChatMessagePatch,
): ChatMessage {
  return { id: ++nextMsgId, from, text: '', ...patch };
}

export function useCoachChat(initialMessages?: ChatMessage[]) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages ?? [],
  );
  const chatRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const abortStreams = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const newAbortSignal = useCallback(() => {
    abortStreams();
    abortRef.current = new AbortController();
    return abortRef.current.signal;
  }, [abortStreams]);

  const pushCoach = useCallback((patch: ChatMessagePatch) => {
    const id = ++nextMsgId;
    setMessages((ms) => [...ms, { id, from: 'coach', text: '', ...patch }]);
    return id;
  }, []);

  const pushPlayer = useCallback((patch: ChatMessagePatch) => {
    const id = ++nextMsgId;
    setMessages((ms) => [...ms, { id, from: 'player', text: '', ...patch }]);
    return id;
  }, []);

  const pushSys = useCallback((text: string) => {
    setMessages((ms) => [...ms, { id: ++nextMsgId, from: 'system', text }]);
  }, []);

  const replaceMessage = useCallback((id: number, patch: ChatMessagePatch) => {
    setMessages((ms) =>
      ms.map((m) => (m.id === id ? { ...m, ...patch, think: false } : m)),
    );
  }, []);

  const appendToMessage = useCallback((id: number, text: string) => {
    setMessages((ms) =>
      ms.map((m) =>
        m.id === id ? { ...m, text: m.text + text, think: false } : m,
      ),
    );
  }, []);

  const resetMessages = useCallback((next: ChatMessage[]) => {
    abortStreams();
    setMessages(next);
  }, [abortStreams]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => () => abortStreams(), [abortStreams]);

  return {
    messages,
    setMessages,
    chatRef,
    pushCoach,
    pushPlayer,
    pushSys,
    replaceMessage,
    appendToMessage,
    resetMessages,
    newAbortSignal,
    abortStreams,
  };
}
