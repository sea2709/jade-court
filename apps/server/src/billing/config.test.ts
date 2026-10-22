import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_PLAY_AI_ACCESS_HOURS,
  playAiAccessHours,
  resetBillingConfigForTests,
} from './config.js';

describe('playAiAccessHours', () => {
  afterEach(() => {
    resetBillingConfigForTests();
  });

  it('defaults to 24 when unset', () => {
    expect(playAiAccessHours()).toBe(24);
  });

  it('reads a positive finite value', () => {
    process.env.PLAY_AI_ACCESS_HOURS = '48';
    expect(playAiAccessHours()).toBe(48);
  });

  it('falls back to 24 for invalid values', () => {
    for (const bad of ['0', '-1', 'abc', 'Infinity', '']) {
      process.env.PLAY_AI_ACCESS_HOURS = bad;
      expect(playAiAccessHours()).toBe(24);
    }
  });

  it('clamps env values above the max grant cap', () => {
    process.env.PLAY_AI_ACCESS_HOURS = '20000';
    expect(playAiAccessHours()).toBe(MAX_PLAY_AI_ACCESS_HOURS);
  });

  it('allows the max cap exactly', () => {
    process.env.PLAY_AI_ACCESS_HOURS = String(MAX_PLAY_AI_ACCESS_HOURS);
    expect(playAiAccessHours()).toBe(MAX_PLAY_AI_ACCESS_HOURS);
  });
});
