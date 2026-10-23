import type { Difficulty } from '@jade-court/xiangqi-engine';
import type { ReactNode, RefObject } from 'react';
import type { AiModelOption } from '../../lib/aiModelsApi';
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
  models?: AiModelOption[];
  modelId?: string | null;
  onModelChange?: (id: string) => void;
  modelsDisabled?: boolean;
  modelsLoading?: boolean;
}

export function CoachChatPanel({
  messages,
  chatRef,
  difficulty,
  onDifficultyChange,
  coachThinking,
  footer,
  models = [],
  modelId,
  onModelChange,
  modelsDisabled = false,
  modelsLoading = false,
}: CoachChatPanelProps) {
  const showModelPicker = onModelChange != null;

  return (
    <div className="card flex flex-col learn-chat-panel overflow-hidden">
      <div className="px-[18px] py-4 border-b border-line-soft flex items-center gap-3 flex-wrap">
        <CoachAvatar size={44} mood={coachThinking ? 'think' : 'happy'} showAiTag />
        <div className="min-w-0 flex-1">
          <div className="font-display font-extrabold text-[17px] flex items-center gap-2 flex-wrap">
            Master Lin
            <span className="pill pill-jade text-[10px] py-0.5 px-2">AI</span>
          </div>
          <div className="text-[12.5px] text-muted font-bold">AI player and coach</div>
        </div>
        {showModelPicker ? (
          <select
            aria-label="AI model"
            value={modelId ?? ''}
            disabled={modelsDisabled || modelsLoading || !models.length}
            onChange={(e) => onModelChange(e.target.value)}
            className="chat-select w-full sm:w-auto sm:max-w-[180px]"
            title={
              modelsDisabled
                ? 'Model list unavailable'
                : models.find((m) => m.id === modelId)?.blurb
            }
          >
            {models.length === 0 ? (
              <option value="">Default model</option>
            ) : (
              models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))
            )}
          </select>
        ) : null}
        <select
          value={difficulty}
          onChange={(e) => onDifficultyChange(e.target.value as Difficulty)}
          className="chat-select"
          aria-label="Coach difficulty"
        >
          <option value="beginner">Gentle</option>
          <option value="intermediate">Firm</option>
          <option value="advanced">Tough</option>
        </select>
      </div>

      <div ref={chatRef} className="scroll-area flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.map((m) => (
          <ChatBubble key={m.id} m={m} />
        ))}
      </div>

      <div className="p-3.5 border-t border-line-soft flex flex-col gap-2 bg-cream">{footer}</div>
    </div>
  );
}
