import { describe, expect, it } from 'vitest';
import * as X from '../rules.js';
import { findLegalMove, parseMoveJson, resolveModelMove } from './parse.js';

describe('llm parse', () => {
  it('parses raw JSON move', () => {
    const p = parseMoveJson('{"from":[9,0],"to":[7,0],"comment":"advance"}');
    expect(p).toEqual({ from: [9, 0], to: [7, 0] });
  });

  it('parses fenced JSON', () => {
    const p = parseMoveJson('Here:\n```json\n{"from":[9,0],"to":[7,0]}\n```');
    expect(p?.from).toEqual([9, 0]);
  });

  it('rejects out-of-bounds coords', () => {
    expect(parseMoveJson('{"from":[99,0],"to":[7,0]}')).toBeNull();
  });

  it('findLegalMove matches engine legal list', () => {
    const b = X.initialBoard();
    const legal = X.legalMoves(b, 'r');
    const first = legal[0]!;
    const found = findLegalMove(b, 'r', { from: first.from, to: first.to });
    expect(found).toEqual(first);
  });

  it('findLegalMove returns null for illegal suggestion', () => {
    const b = X.initialBoard();
    expect(findLegalMove(b, 'r', { from: [9, 0], to: [0, 0] })).toBeNull();
  });

  it('resolveModelMove uses 1-based moveIndex', () => {
    const b = X.initialBoard();
    const legal = X.legalMoves(b, 'b');
    const third = legal[2]!;
    const resolved = resolveModelMove(b, 'b', legal, '{"moveIndex":3,"comment":"develop"}');
    expect(resolved?.move).toEqual(third);
    expect(resolved?.comment).toBe('develop');
  });
});
