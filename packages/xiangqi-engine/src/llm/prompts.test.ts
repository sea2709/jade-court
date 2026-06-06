import { describe, expect, it } from 'vitest';
import * as X from '../rules.js';
import {
  coachAskSystem,
  coachAskUser,
  coachFeedbackSystem,
  coachFeedbackUser,
  coachHintSystem,
  coachHintUser,
  coachOpeningSystem,
  coachOpeningUser,
  moveSelectionSystem,
} from './prompts.js';

describe('coachFeedbackUser', () => {
  it('includes verdict and board context', () => {
    const board = X.initialBoard();
    const move = { from: [9, 1] as [number, number], to: [7, 2] as [number, number] };
    const user = coachFeedbackUser({
      boardBefore: board,
      move,
      side: 'r',
      verdict: 'good',
      lossCp: 40,
      moveDescription: 'Horse advances.',
      bestMove: null,
    });
    expect(user).toContain('Engine verdict: Good move');
    expect(user).toContain('Centipawn loss vs best: 40');
    expect(user).toContain('Position before the move');
    expect(user).toContain('Horse advances.');
  });

  it('mentions engine alternative on mistakes', () => {
    const board = X.initialBoard();
    const user = coachFeedbackUser({
      boardBefore: board,
      move: { from: [9, 0], to: [8, 0] },
      side: 'r',
      verdict: 'mistake',
      lossCp: 500,
      moveDescription: 'Soldier steps forward.',
      bestMove: { from: [9, 1], to: [7, 2] },
    });
    expect(user).toContain('Engine suggests instead');
    expect(user).toContain('Horse');
  });
});

describe('coachHintUser', () => {
  it('includes best move narration and board', () => {
    const board = X.initialBoard();
    const user = coachHintUser({
      board,
      side: 'r',
      bestMove: { from: [9, 1], to: [7, 2] },
      moveDescription: 'Horse from b1 to c3.',
      givesCheck: false,
      captures: false,
    });
    expect(user).toContain('Engine best move: Horse from b1 to c3.');
    expect(user).toContain('Board (student perspective)');
  });
});

describe('coach system prompts', () => {
  it('coachFeedbackSystem requires JSON desc/body', () => {
    expect(coachFeedbackSystem()).toContain('"desc"');
    expect(coachFeedbackSystem()).toContain('do NOT change');
  });

  it('coachHintSystem requires JSON text/tip', () => {
    expect(coachHintSystem()).toContain('"text"');
    expect(coachHintSystem()).toContain('do NOT suggest a different move');
  });

  it('coachOpeningUser reflects difficulty', () => {
    expect(coachOpeningUser('beginner')).toContain('beginner');
    expect(coachOpeningUser('advanced')).toContain('experienced');
  });

  it('move selection prompt stays separate from coach', () => {
    expect(moveSelectionSystem('beginner')).toContain('moveIndex');
    expect(coachOpeningSystem()).not.toContain('moveIndex');
  });
});

describe('coachAskUser', () => {
  it('includes question and board context', () => {
    const board = X.initialBoard();
    const user = coachAskUser({
      board,
      side: 'r',
      question: 'Why is my chariot important?',
      inCheck: false,
    });
    expect(user).toContain('Why is my chariot important?');
    expect(user).toContain('Current board');
    expect(coachAskSystem()).toContain('hint button');
  });
});
