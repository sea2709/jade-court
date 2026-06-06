import type { Difficulty } from '@jade-court/xiangqi-engine';
import type { ReactNode, RefObject } from 'react';
import { CoachAvatar } from '../CoachAvatar';
import { ChatBubble } from './ChatBubble';
import type { ChatMessage } from './types';

interface CoachChatPanelProps {
  messages: ChatMessage[];
  chatRef: RefObject<HTMLDivElement | null>;
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  coachThinking: boolean;
  footer: ReactNode;
}

export function CoachChatPanel({
  messages,
  chatRef,
  difficulty,
  onDifficultyChange,
  coachThinking,
  footer,
}: CoachChatPanelProps) {
  return (
    <div className="card flex flex-col learn-chat-panel overflow-hidden">
      <div className="px-[18px] py-4 border-b border-line-soft flex items-center gap-3">
        <CoachAvatar size={44} mood={coachThinking ? 'think' : 'happy'} />
        <div>
          <div className="font-display font-extrabold text-[17px]">Master Lin</div>
          <div className="text-[12.5px] text-muted font-bold">Your Xiangqi coach</div>
        </div>
        <select
          value={difficulty}
          onChange={(e) => onDifficultyChange(e.target.value as Difficulty)}
          className="chat-select ml-auto"
        >
          <option value="beginner">Gentle</option>
          <option value="intermediate">Firm</option>
          <option value="advanced">Tough</option>
        </select>
      </div>

      <div
        ref={chatRef}
        className="scroll-area flex-1 overflow-y-auto p-4 flex flex-col gap-3"
      >
        {messages.map((m) => (
          <ChatBubble key={m.id} m={m} />
        ))}
      </div>

      <div className="p-3.5 border-t border-line-soft flex flex-col gap-2 bg-cream">{footer}</div>
    </div>
  );
}
