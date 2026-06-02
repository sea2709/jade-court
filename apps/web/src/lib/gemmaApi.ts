import type {
  AiMoveRequest,
  AiMoveResponse,
  Board,
  CoachFeedbackRequest,
  CoachFeedbackResponse,
  CoachHintRequest,
  CoachHintResponse,
  CoachOpeningRequest,
  CoachOpeningResponse,
  Coord,
  Difficulty,
  Move,
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

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-guest-id': getGuestId(),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new GemmaApiError(data.error ?? res.statusText, res.status, data.error);
  }
  return data;
}

export async function fetchAiMove(params: FetchAiMoveParams): Promise<AiMoveResponse> {
  const body: AiMoveRequest = {
    board: params.board,
    side: params.side,
    difficulty: params.difficulty,
    ...(params.lastMove ? { lastMove: params.lastMove } : {}),
    ...(params.history?.length ? { history: params.history } : {}),
  };
  return postJson<AiMoveResponse>('/api/ai/move', body);
}

export interface FetchCoachFeedbackParams {
  boardBefore: Board;
  move: Move;
  side: Side;
  depth?: number;
  difficulty?: Difficulty;
  history?: CoachFeedbackRequest['history'];
}

export interface FetchCoachHintParams {
  board: Board;
  side: Side;
  depth?: number;
  difficulty?: Difficulty;
}

export async function fetchCoachFeedback(
  params: FetchCoachFeedbackParams,
): Promise<CoachFeedbackResponse> {
  const body: CoachFeedbackRequest = {
    boardBefore: params.boardBefore,
    move: params.move,
    side: params.side,
    depth: params.depth,
    difficulty: params.difficulty,
    ...(params.history?.length ? { history: params.history } : {}),
  };
  return postJson<CoachFeedbackResponse>('/api/coach/feedback', body);
}

export async function fetchCoachHint(params: FetchCoachHintParams): Promise<CoachHintResponse> {
  const body: CoachHintRequest = {
    board: params.board,
    side: params.side,
    depth: params.depth,
    difficulty: params.difficulty,
  };
  return postJson<CoachHintResponse>('/api/coach/hint', body);
}

export async function fetchCoachOpening(
  params: Pick<CoachOpeningRequest, 'difficulty'> = {},
): Promise<CoachOpeningResponse> {
  return postJson<CoachOpeningResponse>('/api/coach/opening', params);
}

export function isGemmaUnconfigured(err: unknown): boolean {
  return err instanceof GemmaApiError && err.status === 503 && err.code === 'gemma_unconfigured';
}
