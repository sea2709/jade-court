import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createCoachMessage } from '../../hooks/useCoachChat';
import { CoachChatPanel } from './CoachChatPanel';

describe('CoachChatPanel', () => {
  const baseProps = {
    messages: [createCoachMessage('coach', { text: 'Hello there' })],
    chatRef: { current: null },
    difficulty: 'beginner' as const,
    onDifficultyChange: vi.fn(),
    coachThinking: false,
    footer: <div>Footer</div>,
  };

  it('shows AI branding in the header and bubbles', () => {
    render(<CoachChatPanel {...baseProps} />);
    expect(screen.getByText('AI player and coach')).toBeInTheDocument();
    expect(screen.getAllByText('Master Lin · AI').length).toBeGreaterThan(0);
  });

  it('calls onModelChange when the model picker changes', async () => {
    const onModelChange = vi.fn();
    render(
      <CoachChatPanel
        {...baseProps}
        models={[
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Beta' },
        ]}
        modelId="a"
        onModelChange={onModelChange}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('AI model'), 'b');
    expect(onModelChange).toHaveBeenCalledWith('b');
  });
});
