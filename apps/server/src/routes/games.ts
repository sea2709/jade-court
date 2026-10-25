/**
 * Active game save/resume for Play vs Computer and Play with AI.
 */
import { Hono } from 'hono';
import { saveUserFinishedGame } from '../db.js';
import { capChat, MAX_MOVES_REQUEST_LENGTH, MAX_SAVE_PLIES } from '../games/caps.js';
import {
  parseAiConfig,
  parseBaseRevision,
  parseChatArray,
  parseGameMode,
  parsePvcConfig,
} from '../games/parse.js';
import { parseMovesArray, replaySavedMoves } from '../games/replay.js';
import { toActiveGameResponse } from '../games/serialize.js';
import type { SavedGameStore } from '../games/store.js';
import { requireUser } from '../middleware/auth.js';
import type { AppVariables } from '../types/hono.js';

export type GamesRouteDeps = {
  savedGameStore: SavedGameStore;
};

function invalidMode(c: { json: (body: unknown, status: number) => Response }) {
  return c.json({ error: 'invalid_mode' }, 400);
}

/** Routes under `/api/games`. */
export function createGamesRoutes(deps: GamesRouteDeps) {
  const routes = new Hono<{ Variables: AppVariables }>();

  routes.get('/active', requireUser, async (c) => {
    c.header('Cache-Control', 'no-store');
    const userId = c.get('user')!.id;
    const games = await deps.savedGameStore.listSummaries(userId);
    return c.json({ games });
  });

  routes.get('/active/:mode', requireUser, async (c) => {
    c.header('Cache-Control', 'no-store');
    const mode = parseGameMode(c.req.param('mode'));
    if (!mode) return invalidMode(c);
    const userId = c.get('user')!.id;
    const record = await deps.savedGameStore.findByUserAndMode(userId, mode);
    if (!record) return c.json({ error: 'not_found' }, 404);
    return c.json(toActiveGameResponse(record));
  });

  routes.put('/active/:mode', requireUser, async (c) => {
    c.header('Cache-Control', 'no-store');
    const mode = parseGameMode(c.req.param('mode'));
    if (!mode) return invalidMode(c);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ error: 'invalid_json' }, 400);
    }

    const o = body as Record<string, unknown>;
    const config = mode === 'pvc' ? parsePvcConfig(o.config) : parseAiConfig(o.config);
    if (!config) return c.json({ error: 'invalid_config' }, 400);

    if (!Array.isArray(o.moves)) {
      return c.json({ error: 'invalid_moves' }, 400);
    }
    if (o.moves.length > MAX_MOVES_REQUEST_LENGTH) {
      return c.json({ error: 'too_many_moves' }, 400);
    }

    const movesRaw = parseMovesArray(o.moves);
    if (movesRaw === null) return c.json({ error: 'invalid_moves' }, 400);
    if (movesRaw.length > MAX_SAVE_PLIES) {
      return c.json({ error: 'too_many_moves' }, 400);
    }

    const chatParsed = parseChatArray(o.chat);
    if (chatParsed === null) return c.json({ error: 'invalid_chat' }, 400);

    const baseRevision = parseBaseRevision(o.baseRevision);
    if (o.baseRevision !== undefined && o.baseRevision !== null && baseRevision === undefined) {
      return c.json({ error: 'invalid_base_revision' }, 400);
    }

    const replay = replaySavedMoves(movesRaw);
    if (!replay.ok) {
      return c.json({ error: 'invalid_moves' }, 400);
    }

    const userId = c.get('user')!.id;

    if (replay.status === 'checkmate' || replay.status === 'stalemate') {
      await saveUserFinishedGame({
        userId,
        mode,
        config,
        moves: movesRaw,
        status: replay.status,
        endedAt: new Date(),
      });
      await deps.savedGameStore.delete(userId, mode);
      return c.json({ finished: true, status: replay.status });
    }

    let chatForStore: ReturnType<typeof capChat> | undefined;
    if (mode === 'ai') {
      if (chatParsed !== undefined) {
        chatForStore = capChat(chatParsed);
      } else {
        const existing = await deps.savedGameStore.findByUserAndMode(userId, mode);
        if (existing?.chat) {
          chatForStore = existing.chat;
        }
      }
    } else if (chatParsed !== undefined) {
      chatForStore = capChat(chatParsed);
    }

    const result = await deps.savedGameStore.upsert({
      userId,
      mode,
      config,
      moves: movesRaw,
      ...(chatForStore ? { chat: chatForStore } : {}),
      baseRevision,
    });

    if (!result.ok) {
      return c.json({ error: 'stale_revision' }, 409);
    }

    return c.json(toActiveGameResponse(result.record));
  });

  routes.delete('/active/:mode', requireUser, async (c) => {
    c.header('Cache-Control', 'no-store');
    const mode = parseGameMode(c.req.param('mode'));
    if (!mode) return invalidMode(c);
    const userId = c.get('user')!.id;
    await deps.savedGameStore.delete(userId, mode);
    return c.body(null, 204);
  });

  return routes;
}
