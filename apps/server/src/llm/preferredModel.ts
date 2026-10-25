/**
 * Persist last chosen model preset for signed-in players.
 */
import type { Context } from 'hono';
import { getGuestId } from '../middleware/auth.js';
import type { AppVariables } from '../types/hono.js';
import type { UserStore } from '../users/store.js';
import { resolveLlmSelection } from './modelSelection.js';
import type { LlmLogContext } from './types.js';

export async function savePreferredModelIfAuthenticated(
  c: Context<{ Variables: AppVariables }>,
  userStore: UserStore,
  modelId?: string,
): Promise<void> {
  const user = c.get('user');
  if (!user || !modelId) return;
  const resolved = resolveLlmSelection(modelId);
  if (!resolved.ok) return;
  await userStore.setPreferredModelId(user.id, modelId);
}

/** Build token log context from the Hono request. */
export function llmLogContextFromRequest(
  c: Context<{ Variables: AppVariables }>,
  selectionPresetId?: string,
): LlmLogContext {
  const user = c.get('user');
  if (user) {
    return {
      actorId: user.id,
      actorKind: 'user',
      ...(selectionPresetId ? { presetId: selectionPresetId } : {}),
    };
  }
  return {
    actorId: getGuestId(c),
    actorKind: 'guest',
    ...(selectionPresetId ? { presetId: selectionPresetId } : {}),
  };
}
