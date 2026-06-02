import type { AiProvider } from '../hooks/useXiangqiGame';

/** Play vs Computer opponent backend (Learn uses Gemma explicitly). */
export function playOpponentProvider(): AiProvider {
  const v = import.meta.env.VITE_PLAY_OPPONENT_PROVIDER?.trim().toLowerCase();
  if (v === 'gemma' || v === 'local' || v === 'engine') return v;
  return 'engine';
}
