/**
 * POST /api/coach/* — Master Lin natural-language coach (engine grades; LLM explains).
 */
import { Hono } from 'hono';
import { AI, Coach, LLM, X } from '@jade-court/xiangqi-engine';
import type {
  Board,
  CoachFeedbackRequest,
  CoachFeedbackResponse,
  CoachHintRequest,
  CoachHintResponse,
  CoachOpeningResponse,
  Difficulty,
  Move,
  Side,
} from '@jade-court/xiangqi-engine';
import {
  isLlmConfigured,
  llmGenerateCoachFeedbackJson,
  llmGenerateCoachHintJson,
  llmGenerateCoachOpeningJson,
  llmHistoryLimit,
} from '../llm/client.js';
import { checkRateLimit } from '../llm/rateLimit.js';
import { getGuestId } from '../middleware/auth.js';

const coach = new Hono();

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
  return (
    Array.isArray(m.from) &&
    m.from.length === 2 &&
    Array.isArray(m.to) &&
    m.to.length === 2
  );
}

function parseDifficulty(v: unknown): Difficulty | undefined {
  if (v === 'beginner' || v === 'intermediate' || v === 'advanced') return v;
  return undefined;
}

function templateFeedback(req: CoachFeedbackRequest): CoachFeedbackResponse {
  const depth = req.depth ?? 2;
  const fb = Coach.feedbackFor(req.boardBefore, req.move, req.side, depth);
  return {
    verdict: fb.verdict,
    label: fb.label,
    emoji: fb.emoji,
    tone: fb.tone,
    lossCp: fb.lossCp,
    desc: fb.desc,
    body: fb.body,
    source: 'template',
  };
}

function templateHint(req: CoachHintRequest): CoachHintResponse | null {
  const depth = req.depth ?? 2;
  const h = Coach.hint(req.board, req.side, depth);
  if (!h.move) return null;
  return { move: h.move, text: h.text, tip: h.tip, source: 'template' };
}

coach.post('/feedback', async (c) => {
  const guestId = getGuestId(c);
  if (!checkRateLimit(guestId)) {
    return c.json({ error: 'rate_limit_exceeded' }, 429);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  if (!body || typeof body !== 'object') return c.json({ error: 'invalid_request' }, 400);
  const o = body as Record<string, unknown>;
  if (!isBoard(o.boardBefore) || !isMove(o.move)) return c.json({ error: 'invalid_request' }, 400);
  if (o.side !== 'r' && o.side !== 'b') return c.json({ error: 'invalid_request' }, 400);

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

  if (!isLlmConfigured()) {
    return c.json({ error: 'llm_unconfigured' }, 503);
  }

  try {
    const system = LLM.coachFeedbackSystem();
    const user = LLM.coachFeedbackUser({
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
    const raw = await llmGenerateCoachFeedbackJson(system, user);
    const copy = LLM.parseCoachFeedbackJson(raw);
    if (!copy) {
      console.warn('[llm] invalid coach feedback JSON, using template');
      return c.json(templateFeedback(req));
    }
    const res: CoachFeedbackResponse = {
      verdict: grade.verdict,
      label: v.label,
      emoji: v.emoji,
      tone: v.tone,
      lossCp: grade.lossCp,
      desc: copy.desc,
      body: copy.body,
      source: 'llm',
    };
    return c.json(res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'llm_unconfigured') return c.json({ error: 'llm_unconfigured' }, 503);
    console.warn('[llm] coach feedback error, template fallback:', msg);
    return c.json(templateFeedback(req));
  }
});

coach.post('/hint', async (c) => {
  const guestId = getGuestId(c);
  if (!checkRateLimit(guestId)) {
    return c.json({ error: 'rate_limit_exceeded' }, 429);
  }

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

  if (!isLlmConfigured()) {
    return c.json({ error: 'llm_unconfigured' }, 503);
  }

  try {
    const system = LLM.coachHintSystem();
    const user = LLM.coachHintUser({
      board: req.board,
      side: req.side,
      bestMove: move,
      moveDescription,
      givesCheck,
      captures: Boolean(captured),
      difficulty: req.difficulty,
    });
    const raw = await llmGenerateCoachHintJson(system, user);
    const copy = LLM.parseCoachHintJson(raw);
    if (!copy) {
      console.warn('[llm] invalid coach hint JSON, using template');
      const fallback = templateHint(req);
      return fallback ? c.json(fallback) : c.json({ error: 'no_legal_moves' }, 400);
    }
    const res: CoachHintResponse = {
      move,
      text: copy.text,
      tip: copy.tip,
      source: 'llm',
    };
    return c.json(res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'llm_unconfigured') return c.json({ error: 'llm_unconfigured' }, 503);
    console.warn('[llm] coach hint error, template fallback:', msg);
    const fallback = templateHint(req);
    return fallback ? c.json(fallback) : c.json({ error: 'no_legal_moves' }, 400);
  }
});

coach.post('/opening', async (c) => {
  const guestId = getGuestId(c);
  if (!checkRateLimit(guestId)) {
    return c.json({ error: 'rate_limit_exceeded' }, 429);
  }

  let difficulty: Difficulty | undefined;
  try {
    const body = await c.req.json();
    if (body && typeof body === 'object') {
      difficulty = parseDifficulty((body as Record<string, unknown>).difficulty);
    }
  } catch {
    /* empty body is fine */
  }

  if (!isLlmConfigured()) {
    return c.json({ error: 'llm_unconfigured' }, 503);
  }

  try {
    const raw = await llmGenerateCoachOpeningJson(
      LLM.coachOpeningSystem(),
      LLM.coachOpeningUser(difficulty),
    );
    const copy = LLM.parseCoachOpeningJson(raw);
    if (!copy) {
      const res: CoachOpeningResponse = { text: Coach.opening(), source: 'template' };
      return c.json(res);
    }
    return c.json({ text: copy.text, source: 'llm' } satisfies CoachOpeningResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'llm_unconfigured') return c.json({ error: 'llm_unconfigured' }, 503);
    console.warn('[llm] coach opening error, template fallback:', msg);
    return c.json({ text: Coach.opening(), source: 'template' } satisfies CoachOpeningResponse);
  }
});

export default coach;
