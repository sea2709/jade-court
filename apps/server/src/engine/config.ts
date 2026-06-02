import { existsSync } from 'node:fs';

export type PlayOpponentProvider = 'engine' | 'gemma' | 'local';

export function pikafishPath(): string | undefined {
  const p = process.env.PIKAFISH_PATH?.trim();
  return p || undefined;
}

export function isPikafishConfigured(): boolean {
  const path = pikafishPath();
  return Boolean(path && existsSync(path));
}

export function playOpponentProvider(): PlayOpponentProvider {
  const v = process.env.PLAY_OPPONENT_PROVIDER?.trim().toLowerCase();
  if (v === 'gemma' || v === 'local' || v === 'engine') return v;
  return 'engine';
}

export function engineMoveTimeoutMs(): number {
  const n = Number(process.env.ENGINE_MOVE_TIMEOUT_MS ?? 30000);
  return Number.isFinite(n) && n > 0 ? n : 30000;
}
