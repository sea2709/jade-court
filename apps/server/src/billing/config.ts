/**
 * Day-pass / play-AI access duration from environment.
 */

const DEFAULT_PLAY_AI_ACCESS_HOURS = 24;

/** Maximum hours per grant (env default, admin grant body, and future checkout). */
export const MAX_PLAY_AI_ACCESS_HOURS = 8760;

/**
 * Hours granted per day pass (admin grant default and checkout placeholder).
 * Invalid or non-positive env values fall back to 24; values above {@link MAX_PLAY_AI_ACCESS_HOURS}
 * are clamped to that cap.
 */
export function playAiAccessHours(): number {
  const raw = process.env.PLAY_AI_ACCESS_HOURS?.trim();
  if (!raw) return DEFAULT_PLAY_AI_ACCESS_HOURS;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) {
    return DEFAULT_PLAY_AI_ACCESS_HOURS;
  }
  if (hours > MAX_PLAY_AI_ACCESS_HOURS) {
    return MAX_PLAY_AI_ACCESS_HOURS;
  }
  return hours;
}

/** Reset cached env readers (Vitest only). */
export function resetBillingConfigForTests(): void {
  delete process.env.PLAY_AI_ACCESS_HOURS;
}
