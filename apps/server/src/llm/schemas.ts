/**
 * JSON schemas for structured LLM responses (opponent moves + coach copy).
 */

export const MOVE_SCHEMA = {
  type: 'object',
  properties: {
    moveIndex: { type: 'integer' },
    comment: { type: 'string' },
  },
  required: ['moveIndex'],
} as const;

export const COACH_FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    desc: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['desc', 'body'],
} as const;

export const COACH_HINT_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    tip: { type: 'string' },
  },
  required: ['text', 'tip'],
} as const;

export const COACH_OPENING_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
  },
  required: ['text'],
} as const;

export const COACH_ASK_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
  },
  required: ['text'],
} as const;
