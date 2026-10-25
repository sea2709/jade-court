/** POST /api/coach/{feedback,hint,ask}/stream — SSE coach copy. */
import { AI, Coach, LLM, X } from '@jade-court/xiangqi-engine';
import type {
  Board,
  CoachAskRequest,
  CoachFeedbackRequest,
  CoachHintRequest,
  Difficulty,
  Move,
} from '@jade-court/xiangqi-engine';
import type { Hono } from 'hono';
import type { AppVariables } from '../types/hono.js';
import { coachSseResponse, type CoachSseEvent } from '../coach/sse.js';
import {
  llmGenerateCoachAskJson,
  llmGenerateCoachFeedbackJson,
  llmGenerateCoachHintJson,
  llmHistoryLimit,
  llmStreamCoachText,
  type LlmCallOptions,
} from '../llm/client.js';
import {
  resolveModelRouteContext,
  isResolvedLlmAvailable,
  isLlmAvailableForCall,
} from '../llm/routeHelpers.js';
import { savePreferredModelIfAuthenticated } from '../llm/preferredModel.js';
import type { UserStore } from '../users/store.js';

const MAX_QUESTION_LEN = 500;

function isBoard(v: unknown): v is Board {
  if (!Array.isArray(v) || v.length !== X.ROWS) return false;
  return v.every(
    (row) =>
      Array.isArray(row) &&
      row.length === X.COLS &&
      row.every(
        (cell) =>
          cell === null ||
          (typeof cell === 'object' &&
            cell !== null &&
            (cell.s === 'r' || cell.s === 'b') &&
            typeof cell.t === 'string'),
      ),
  );
}

function isMove(v: unknown): v is Move {
  if (!v || typeof v !== 'object') return false;
  const m = v as Move;
  return Array.isArray(m.from) && m.from.length === 2 && Array.isArray(m.to) && m.to.length === 2;
}

function parseDifficulty(v: unknown): Difficulty | undefined {
  if (v === 'beginner' || v === 'intermediate' || v === 'advanced') return v;
  return undefined;
}

async function streamCoachLlmText(
  send: (event: CoachSseEvent) => void,
  llmOptions: LlmCallOptions,
  system: string,
  user: string,
  templateText: string,
  batchFallback?: () => Promise<string>,
): Promise<'llm' | 'template'> {
  const selection = llmOptions.selection ?? { provider: 'gemini', model: '' };
  const configured = isLlmAvailableForCall(selection);
  if (!configured) {
    send({ type: 'token', text: templateText });
    return 'template';
  }
  try {
    for await (const chunk of llmStreamCoachText(system, user, llmOptions)) {
      send({ type: 'token', text: chunk });
    }
    return 'llm';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'llm_unconfigured') {
      send({ type: 'token', text: templateText });
      return 'template';
    }
    if (msg === 'llm_stream_not_implemented' && batchFallback) {
      const text = await batchFallback();
      send({ type: 'token', text });
      return 'llm';
    }
    throw err;
  }
}

export function registerCoachStreamRoutes(
  coach: Hono<{ Variables: AppVariables }>,
  deps: { userStore: UserStore },
): void {
  coach.post('/feedback/stream', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }

    if (!body || typeof body !== 'object') return c.json({ error: 'invalid_request' }, 400);
    const o = body as Record<string, unknown>;
    if (!isBoard(o.boardBefore) || !isMove(o.move))
      return c.json({ error: 'invalid_request' }, 400);
    if (o.side !== 'r' && o.side !== 'b') return c.json({ error: 'invalid_request' }, 400);

    const modelRoute = resolveModelRouteContext(c, o);
    if (!modelRoute.ok) {
      return c.json({ error: modelRoute.error }, modelRoute.status);
    }
    if (modelRoute.ctx.modelId && !isResolvedLlmAvailable(modelRoute.ctx)) {
      return c.json({ error: 'llm_unconfigured' }, 503);
    }
    await savePreferredModelIfAuthenticated(c, deps.userStore, modelRoute.ctx.modelId);

    const req: CoachFeedbackRequest = {
      boardBefore: o.boardBefore,
      move: o.move,
      side: o.side,
      depth: typeof o.depth === 'number' ? o.depth : undefined,
      difficulty: parseDifficulty(o.difficulty),
      history: o.history as CoachFeedbackRequest['history'],
    };

    const depth = req.depth ?? 2;
    const grade = AI.gradeMove(req.boardBefore, req.side, req.move, depth);
    const v = Coach.VERDICT[grade.verdict];
    const moveDescription = Coach.describeMove(req.boardBefore, req.move);
    const templateFb = Coach.feedbackFor(req.boardBefore, req.move, req.side, depth);
    const templateText = `${templateFb.desc} ${templateFb.body}`;
    const userPrompt = LLM.coachFeedbackUser({
      boardBefore: req.boardBefore,
      move: req.move,
      side: req.side,
      verdict: grade.verdict,
      lossCp: grade.lossCp,
      moveDescription,
      bestMove: grade.best,
      difficulty: req.difficulty,
      history: req.history,
      historyLimit: llmHistoryLimit(),
    });
    const llmOptions = modelRoute.ctx.llmOptions;

    return coachSseResponse(async (send) => {
      send({
        type: 'meta',
        verdict: grade.verdict,
        label: v.label,
        emoji: v.emoji,
        tone: v.tone,
        lossCp: grade.lossCp,
      });
      const source = await streamCoachLlmText(
        send,
        llmOptions,
        LLM.coachFeedbackStreamSystem(),
        userPrompt,
        templateText,
        async () => {
          const raw = await llmGenerateCoachFeedbackJson(
            LLM.coachFeedbackSystem(),
            userPrompt,
            llmOptions,
          );
          const copy = LLM.parseCoachFeedbackJson(raw);
          if (!copy) throw new Error('invalid_coach_json');
          return `${copy.desc} ${copy.body}`;
        },
      );
      send({ type: 'done', source });
    });
  });

  coach.post('/hint/stream', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }

    if (!body || typeof body !== 'object') return c.json({ error: 'invalid_request' }, 400);
    const o = body as Record<string, unknown>;
    if (!isBoard(o.board)) return c.json({ error: 'invalid_request' }, 400);
    if (o.side !== 'r' && o.side !== 'b') return c.json({ error: 'invalid_request' }, 400);

    const modelRoute = resolveModelRouteContext(c, o);
    if (!modelRoute.ok) {
      return c.json({ error: modelRoute.error }, modelRoute.status);
    }
    if (modelRoute.ctx.modelId && !isResolvedLlmAvailable(modelRoute.ctx)) {
      return c.json({ error: 'llm_unconfigured' }, 503);
    }
    await savePreferredModelIfAuthenticated(c, deps.userStore, modelRoute.ctx.modelId);

    const req: CoachHintRequest = {
      board: o.board,
      side: o.side,
      depth: typeof o.depth === 'number' ? o.depth : undefined,
      difficulty: parseDifficulty(o.difficulty),
    };

    const depth = req.depth ?? 2;
    const { move } = AI.bestMove(req.board, req.side, depth);
    if (!move) return c.json({ error: 'no_legal_moves' }, 400);

    const piece = req.board[move.from[0]]?.[move.from[1]];
    const captured = req.board[move.to[0]]?.[move.to[1]];
    const after = X.applyMove(req.board, move);
    const givesCheck = piece ? X.inCheck(after, X.opp(piece.s)) : false;
    const from = X.squareName(req.side, move.from[0], move.from[1]);
    const to = X.squareName(req.side, move.to[0], move.to[1]);
    const capLabel = captured ? X.NAME[captured.t] : '';
    const moveDescription = piece
      ? `${X.NAME[piece.t]} ${from} → ${to}${capLabel ? ` (captures ${capLabel})` : ''}`
      : 'Best move';

    const templateHint = Coach.hint(req.board, req.side, depth);
    const templateText = templateHint.tip
      ? `${templateHint.text} ${templateHint.tip}`
      : templateHint.text;
    const userPrompt = LLM.coachHintUser({
      board: req.board,
      side: req.side,
      bestMove: move,
      moveDescription,
      givesCheck,
      captures: Boolean(captured),
      difficulty: req.difficulty,
    });
    const llmOptions = modelRoute.ctx.llmOptions;

    return coachSseResponse(async (send) => {
      send({
        type: 'meta',
        move: { from: move.from, to: move.to },
      });
      const source = await streamCoachLlmText(
        send,
        llmOptions,
        LLM.coachHintStreamSystem(),
        userPrompt,
        templateText,
        async () => {
          const raw = await llmGenerateCoachHintJson(LLM.coachHintSystem(), userPrompt, llmOptions);
          const copy = LLM.parseCoachHintJson(raw);
          if (!copy) throw new Error('invalid_coach_json');
          return copy.tip ? `${copy.text} ${copy.tip}` : copy.text;
        },
      );
      send({ type: 'done', source });
    });
  });

  coach.post('/ask/stream', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }

    if (!body || typeof body !== 'object') return c.json({ error: 'invalid_request' }, 400);
    const o = body as Record<string, unknown>;
    if (!isBoard(o.board)) return c.json({ error: 'invalid_request' }, 400);
    if (o.side !== 'r' && o.side !== 'b') return c.json({ error: 'invalid_request' }, 400);
    if (typeof o.question !== 'string' || !o.question.trim()) {
      return c.json({ error: 'invalid_request' }, 400);
    }
    const question = o.question.trim().slice(0, MAX_QUESTION_LEN);

    const modelRoute = resolveModelRouteContext(c, o);
    if (!modelRoute.ok) {
      return c.json({ error: modelRoute.error }, modelRoute.status);
    }
    if (modelRoute.ctx.modelId && !isResolvedLlmAvailable(modelRoute.ctx)) {
      return c.json({ error: 'llm_unconfigured' }, 503);
    }
    await savePreferredModelIfAuthenticated(c, deps.userStore, modelRoute.ctx.modelId);

    const req: CoachAskRequest = {
      board: o.board,
      side: o.side,
      question,
      difficulty: parseDifficulty(o.difficulty),
      history: o.history as CoachAskRequest['history'],
    };

    const inCheck = X.inCheck(req.board, req.side);
    const templateText = Coach.askReply();
    const userPrompt = LLM.coachAskUser({
      board: req.board,
      side: req.side,
      question: req.question,
      difficulty: req.difficulty,
      history: req.history,
      historyLimit: llmHistoryLimit(),
      inCheck,
    });
    const llmOptions = modelRoute.ctx.llmOptions;

    return coachSseResponse(async (send) => {
      const source = await streamCoachLlmText(
        send,
        llmOptions,
        LLM.coachAskSystem(),
        userPrompt,
        templateText,
        async () => {
          const raw = await llmGenerateCoachAskJson(LLM.coachAskSystem(), userPrompt, llmOptions);
          const copy = LLM.parseCoachAskJson(raw);
          if (!copy) throw new Error('invalid_coach_json');
          return copy.text;
        },
      );
      send({ type: 'done', source });
    });
  });

  coach.post('/ask', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }

    if (!body || typeof body !== 'object') return c.json({ error: 'invalid_request' }, 400);
    const o = body as Record<string, unknown>;
    if (!isBoard(o.board)) return c.json({ error: 'invalid_request' }, 400);
    if (o.side !== 'r' && o.side !== 'b') return c.json({ error: 'invalid_request' }, 400);
    if (typeof o.question !== 'string' || !o.question.trim()) {
      return c.json({ error: 'invalid_request' }, 400);
    }
    const question = o.question.trim().slice(0, MAX_QUESTION_LEN);

    const modelRoute = resolveModelRouteContext(c, o);
    if (!modelRoute.ok) {
      return c.json({ error: modelRoute.error }, modelRoute.status);
    }
    if (!isResolvedLlmAvailable(modelRoute.ctx)) {
      return c.json({ error: 'llm_unconfigured' }, 503);
    }
    await savePreferredModelIfAuthenticated(c, deps.userStore, modelRoute.ctx.modelId);

    const req: CoachAskRequest = {
      board: o.board,
      side: o.side,
      question,
      difficulty: parseDifficulty(o.difficulty),
      history: o.history as CoachAskRequest['history'],
    };

    const inCheck = X.inCheck(req.board, req.side);

    try {
      const raw = await llmGenerateCoachAskJson(
        LLM.coachAskSystem(),
        LLM.coachAskUser({
          board: req.board,
          side: req.side,
          question: req.question,
          difficulty: req.difficulty,
          history: req.history,
          historyLimit: llmHistoryLimit(),
          inCheck,
        }),
        modelRoute.ctx.llmOptions,
      );
      const copy = LLM.parseCoachAskJson(raw);
      if (!copy) {
        return c.json({ text: Coach.askReply(), source: 'template' });
      }
      return c.json({ text: copy.text, source: 'llm' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'llm_unconfigured') return c.json({ error: 'llm_unconfigured' }, 503);
      console.warn('[llm] coach ask error, template fallback:', msg);
      return c.json({ text: Coach.askReply(), source: 'template' });
    }
  });
}
