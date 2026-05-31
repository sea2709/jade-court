import type {
  AiMoveRequest,
  AiMoveResponse,
  Board,
  Coord,
  Difficulty,
  Side,
} from '@jade-court/xiangqi-engine';
import { getGuestId } from './guestId';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface FetchAiMoveParams {
  board: Board;
  side: Side;
  difficulty: Difficulty;
  lastMove?: { from: Coord; to: Coord } | null;
  history?: AiMoveRequest['history'];
}

export class GemmaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'GemmaApiError';
  }
}

export async function fetchAiMove(params: FetchAiMoveParams): Promise<AiMoveResponse> {
  const body: AiMoveRequest = {
    board: params.board,
    side: params.side,
    difficulty: params.difficulty,
    ...(params.lastMove ? { lastMove: params.lastMove } : {}),
    ...(params.history?.length ? { history: params.history } : {}),
  };

  const res = await fetch(`${API_BASE}/api/ai/move`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-guest-id': getGuestId(),
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as AiMoveResponse & { error?: string };

  if (!res.ok) {
    throw new GemmaApiError(data.error ?? res.statusText, res.status, data.error);
  }

  return data;
}

/** True when server has no API key — caller should use local negamax. */
export function isGemmaUnconfigured(err: unknown): boolean {
  return err instanceof GemmaApiError && err.status === 503 && err.code === 'gemma_unconfigured';
}
