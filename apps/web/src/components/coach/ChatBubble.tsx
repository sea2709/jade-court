import { CoachAvatar } from '../CoachAvatar';
import type { ChatMessage } from './types';
import { TONE_CLASS } from './types';

export function ChatBubble({ m }: { m: ChatMessage }) {
  const toneClass = TONE_CLASS[m.tone ?? 'info'] ?? 'text-jade-deep';

  if (m.from === 'system') {
    return (
      <div className="pop self-center text-muted text-[13px] font-bold text-center py-0.5">
        {m.text}
      </div>
    );
  }

  if (m.from === 'player') {
    return (
      <div className="pop flex justify-end">
        <div className="chat-bubble-player">
          <div className="text-[14.5px] leading-normal font-semibold text-ink">{m.text}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pop flex gap-2.5 items-start">
      <CoachAvatar size={34} mood={m.think ? 'think' : 'happy'} />
      <div className="chat-bubble">
        {m.verdict && !m.think && (
          <div className="flex items-center gap-[7px] mb-1">
            <span
              className={`font-extrabold text-[13px] inline-flex items-center gap-[5px] ${toneClass}`}
            >
              {m.emoji} {m.label}
            </span>
            {typeof m.lossCp === 'number' && m.lossCp > 60 && (
              <span className="text-[11px] text-muted font-bold">
                −{(m.lossCp / 100).toFixed(1)}
              </span>
            )}
          </div>
        )}
        <div className="text-[14.5px] leading-normal font-semibold text-ink">{m.text}</div>
        {m.sub && !m.think && (
          <div className="text-[13px] leading-snug text-ink-soft font-semibold mt-[5px]">
            {m.sub}
          </div>
        )}
      </div>
    </div>
  );
}
