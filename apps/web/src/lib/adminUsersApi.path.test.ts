import { describe, expect, it } from 'vitest';
import { adminUserDetailPath } from './adminUsersApi';

describe('adminUserDetailPath', () => {
  it('includes userId and optional email q', () => {
    expect(adminUserDetailPath('uuid-1')).toBe('/admin/users?userId=uuid-1');
    expect(adminUserDetailPath('uuid-1', { q: 'a@b.c' })).toBe(
      '/admin/users?userId=uuid-1&q=a%40b.c',
    );
  });
});
