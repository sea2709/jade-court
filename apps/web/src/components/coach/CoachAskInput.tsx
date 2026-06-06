import { useState, type FormEvent } from 'react';

interface CoachAskInputProps {
  disabled?: boolean;
  onAsk: (question: string) => void;
}

export function CoachAskInput({ disabled, onAsk }: CoachAskInputProps) {
  const [question, setQuestion] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || disabled) return;
    onAsk(q);
    setQuestion('');
  };

  return (
    <form className="flex gap-2" onSubmit={submit}>
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask Master Lin…"
        disabled={disabled}
        maxLength={500}
        className="flex-1 text-[13.5px] font-semibold px-3 py-2 rounded-[10px] border border-line-soft bg-white text-ink placeholder:text-muted disabled:opacity-50"
      />
      <button type="submit" className="btn btn-primary btn-sm shrink-0" disabled={disabled || !question.trim()}>
        Send
      </button>
    </form>
  );
}
