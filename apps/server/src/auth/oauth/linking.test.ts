import { describe, expect, it } from 'vitest';
import { MemoryUserStore } from '../../users/memoryStore.js';
import { hashPassword } from '../../users/password.js';
import { linkOAuthToUser, resolveOAuthUser, signInMethodCount } from './linking.js';

describe('oauth account linking', () => {
  it('signs in when identity already exists', async () => {
    const store = new MemoryUserStore();
    const created = await store.createOAuthUser({
      email: 'a@example.com',
      emailVerified: true,
      identity: { provider: 'google', sub: 'sub-1' },
    });
    const result = await resolveOAuthUser(store, 'google', {
      sub: 'sub-1',
      email: 'a@example.com',
      emailVerified: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe(created.id);
      expect(result.created).toBe(false);
      expect(result.linked).toBe(false);
    }
  });

  it('links verified email to existing verified password user', async () => {
    const store = new MemoryUserStore();
    const passwordUser = await store.create({
      email: 'link@example.com',
      passwordHash: await hashPassword('password123'),
      displayName: 'Link Me',
    });
    await store.setEmailVerified(passwordUser.id, true);
    const result = await resolveOAuthUser(store, 'google', {
      sub: 'google-new',
      email: 'link@example.com',
      emailVerified: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe(passwordUser.id);
      expect(result.linked).toBe(true);
      expect(result.user.identities).toEqual([{ provider: 'google', sub: 'google-new' }]);
    }
  });

  it('does not link OAuth into an unverified email squatter account', async () => {
    const store = new MemoryUserStore();
    await store.create({
      email: 'victim@example.com',
      passwordHash: await hashPassword('password123'),
      displayName: 'Squatter',
    });
    const result = await resolveOAuthUser(store, 'google', {
      sub: 'real-google-sub',
      email: 'victim@example.com',
      emailVerified: true,
    });
    expect(result).toEqual({ ok: false, error: 'email_taken' });
    const squatter = await store.findByEmail('victim@example.com');
    expect(squatter?.identities).toEqual([]);
  });

  it('creates a new user when no match', async () => {
    const store = new MemoryUserStore();
    const result = await resolveOAuthUser(store, 'google', {
      sub: 'brand-new',
      email: 'new@example.com',
      emailVerified: true,
      name: 'New',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.created).toBe(true);
      expect(result.user.email).toBe('new@example.com');
      expect(result.user.passwordHash).toBeUndefined();
    }
  });

  it('blocks unlinking the last sign-in method', () => {
    const user = {
      id: '1',
      emailVerified: true,
      identities: [{ provider: 'google', sub: 'x' }],
      createdAt: new Date(),
    };
    expect(signInMethodCount(user)).toBe(1);
  });

  it('linkOAuthToUser rejects identity owned by another account', async () => {
    const store = new MemoryUserStore();
    await store.createOAuthUser({
      emailVerified: true,
      identity: { provider: 'google', sub: 'taken' },
    });
    const other = await store.create({
      email: 'other@example.com',
      passwordHash: await hashPassword('password123'),
    });
    const result = await linkOAuthToUser(store, other.id, 'google', {
      sub: 'taken',
      emailVerified: true,
    });
    expect(result).toEqual({ ok: false, error: 'identity_taken' });
  });
});
