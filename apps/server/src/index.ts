import './loadEnv.js';
import { getRequestListener } from '@hono/node-server';
import { createServer } from 'http';
import { attachRoomSockets, createApp } from './app.js';
import { getDb } from './db.js';
import { isPikafishConfigured, pikafishPath, playOpponentProvider } from './engine/config.js';
import { isLlmConfigured, llmModel, llmProviderId, shouldLogLlmTokenUsage } from './llm/config.js';

const app = createApp();

const port = Number(process.env.PORT ?? 3001);

const listener = getRequestListener(app.fetch);
const httpServer = createServer(listener);
attachRoomSockets(httpServer);

httpServer.listen(port, () => {
  console.log(`Jade Court server listening on http://localhost:${port}`);
  const playProvider = playOpponentProvider();
  console.log(`Play opponent: ${playProvider} — POST /api/opponent/move (PLAY_OPPONENT_PROVIDER)`);
  if (playProvider === 'engine') {
    if (isPikafishConfigured()) {
      console.log(`Pikafish: ${pikafishPath()}`);
    } else {
      console.log('Pikafish: PIKAFISH_PATH missing — Play will use negamax fallback');
    }
  }
  if (isLlmConfigured()) {
    const provider = llmProviderId();
    console.log(`LLM: enabled (${provider} / ${llmModel()}) — /api/ai/move, coach /api/coach/*`);
    if (shouldLogLlmTokenUsage()) {
      console.log('LLM token usage: logging enabled (development)');
    }
  } else {
    console.log(
      `LLM: disabled (set API key for LLM_PROVIDER=${llmProviderId()} — Learn coach and PLAY_OPPONENT_PROVIDER=llm)`,
    );
  }
});

getDb()
  .then((db) => {
    if (db) console.log('MongoDB connected');
    else console.log('MongoDB skipped (set MONGODB_URI to enable persistence)');
  })
  .catch((err) => console.warn('MongoDB connection failed:', err));
