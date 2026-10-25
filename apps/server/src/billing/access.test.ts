import { describe, expect, it } from 'vitest';
import { ensureAccessUntilAtLeast, extendAccess, grantHoursToMs, hasPlayAccess } from './access.js';
import { MAX_PLAY_AI_ACCESS_HOURS } from './config.js';
import { MemoryUserStore } from '../users/memoryStore.js';

describe('hasPlayAccess', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');

  it('is false for null or missing accessUntil', () => {
    expect(hasPlayAccess(null, now)).toBe(false);
    expect(hasPlayAccess({ accessUntil: undefined }, now)).toBe(false);
  });

  it('is false at or after expiry', () => {
    expect(hasPlayAccess({ accessUntil: now }, now)).toBe(false);
    expect(hasPlayAccess({ accessUntil: new Date(now.getTime() - 1) }, now)).toBe(false);
  });

  it('is true strictly before expiry', () => {
    expect(hasPlayAccess({ accessUntil: new Date(now.getTime() + 1) }, now)).toBe(true);
  });
});

describe('grantHoursToMs', () => {
  it('rejects non-finite, non-positive, and above-cap hours', () => {
    expect(grantHoursToMs(0)).toBeNull();
    expect(grantHoursToMs(-1)).toBeNull();
    expect(grantHoursToMs(Number.NaN)).toBeNull();
    expect(grantHoursToMs(MAX_PLAY_AI_ACCESS_HOURS + 1)).toBeNull();
  });

  it('rejects ms that would exceed Number.MAX_SAFE_INTEGER', () => {
    expect(grantHoursToMs(1e10)).toBeNull();
  });

  it('accepts valid grant hours', () => {
    expect(grantHoursToMs(24)).toBe(24 * 60 * 60 * 1000);
  });
});

describe('extendAccess', () => {
  const store = new MemoryUserStore();
  const now = new Date('2026-06-01T00:00:00.000Z');
  const hourMs = 60 * 60 * 1000;

  it('returns null for unknown user id', async () => {
    expect(await extendAccess(store, 'missing-id', 24, now)).toBeNull();
  });

  it('returns null for invalid grant hours without touching the store', async () => {
    const user = await store.create({
      email: 'guard@example.com',
      passwordHash: 'hash',
    });
    expect(await extendAccess(store, user.id, 1e10, now)).toBeNull();
    const unchanged = await store.findById(user.id);
    expect(unchanged?.accessUntil).toBeUndefined();
  });

  it('starts fresh after expiry', async () => {
    const user = await store.create({
      email: 'fresh@example.com',
      passwordHash: 'hash',
    });
    const updated = await extendAccess(store, user.id, 24, now);
    expect(updated?.accessUntil?.getTime()).toBe(now.getTime() + 24 * hourMs);
  });

  it('stacks on remaining time', async () => {
    const user = await store.create({
      email: 'stack@example.com',
      passwordHash: 'hash',
    });
    const first = await extendAccess(store, user.id, 24, now);
    const mid = new Date(now.getTime() + 12 * hourMs);
    const second = await extendAccess(store, user.id, 24, mid);
    expect(first?.accessUntil?.getTime()).toBe(now.getTime() + 24 * hourMs);
    expect(second?.accessUntil?.getTime()).toBe(now.getTime() + 48 * hourMs);
  });
});

describe('ensureAccessUntilAtLeast', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');
  const target = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  it('raises access when below the payment grant end', async () => {
    const store = new MemoryUserStore();
    const user = await store.create({
      email: 'heal@example.com',
      passwordHash: 'hash',
    });
    const updated = await ensureAccessUntilAtLeast(store, user.id, target);
    expect(updated?.accessUntil?.getTime()).toBe(target.getTime());
  });

  it('does not shorten access that already exceeds the grant end', async () => {
    const store = new MemoryUserStore();
    const user = await store.create({
      email: 'no-shrink@example.com',
      passwordHash: 'hash',
    });
    await store.extendAccess(user.id, 48 * 60 * 60 * 1000, now);
    const afterExtend = await store.findById(user.id);
    const updated = await ensureAccessUntilAtLeast(store, user.id, target);
    expect(updated?.accessUntil?.getTime()).toBe(afterExtend?.accessUntil?.getTime());
    expect(updated?.accessUntil?.getTime()).toBeGreaterThan(target.getTime());
  });
});
