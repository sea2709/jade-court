import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PlayerAuthApiError,
  fetchPlayerMe,
  playerForgotPassword,
  playerLogin,
  playerLogout,
  playerRegister,
  playerResendVerification,
  playerResetPassword,
  playerVerifyEmail,
} from './playerAuthApi';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const sampleUser = {
  id: 'u1',
  email: 'a@example.com',
  emailVerified: false,
  displayName: 'Alice',
  accessUntil: null,
  preferredModelId: null,
};

describe('fetchPlayerMe', () => {
  it('calls GET /api/me with credentials include', async () => {
    fetchMock.mockResolvedValue(json({ user: null, access: { active: false, accessUntil: null } }));
    const me = await fetchPlayerMe();
    expect(me.user).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});

describe('playerLogin', () => {
  it('returns user on success', async () => {
    fetchMock.mockResolvedValue(json({ user: sampleUser }));
    const user = await playerLogin('a@example.com', 'password1');
    expect(user).toEqual(sampleUser);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'a@example.com', password: 'password1' }),
      }),
    );
  });

  it('throws PlayerAuthApiError on invalid credentials', async () => {
    fetchMock.mockResolvedValue(json({ error: 'invalid_credentials' }, 401));
    await expect(playerLogin('a@example.com', 'wrong')).rejects.toMatchObject({
      code: 'invalid_credentials',
      status: 401,
    });
  });
});

describe('playerRegister', () => {
  it('sends displayName when provided', async () => {
    fetchMock.mockResolvedValue(json({ user: sampleUser }, 201));
    await playerRegister('a@example.com', 'password1', 'Alice');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'a@example.com',
          password: 'password1',
          displayName: 'Alice',
        }),
      }),
    );
  });

  it('maps email_taken to error code', async () => {
    fetchMock.mockResolvedValue(json({ error: 'email_taken' }, 409));
    await expect(playerRegister('a@example.com', 'password1')).rejects.toBeInstanceOf(
      PlayerAuthApiError,
    );
  });
});

describe('playerVerifyEmail', () => {
  it('maps wrong_account from 403', async () => {
    fetchMock.mockResolvedValue(json({ error: 'wrong_account' }, 403));
    await expect(playerVerifyEmail('tok')).rejects.toMatchObject({
      code: 'wrong_account',
      status: 403,
    });
  });

  it('POSTs token and returns verified user', async () => {
    const verified = { ...sampleUser, emailVerified: true };
    fetchMock.mockResolvedValue(json({ user: verified }));
    const user = await playerVerifyEmail('opaque-token');
    expect(user.emailVerified).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/verify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'opaque-token' }),
      }),
    );
  });
});

describe('playerResendVerification', () => {
  it('POSTs resend with session credentials', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await playerResendVerification();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/resend-verification',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
});

describe('playerForgotPassword', () => {
  it('returns ok and message on success', async () => {
    fetchMock.mockResolvedValue(json({ ok: true, message: 'check_your_email' }));
    const res = await playerForgotPassword('a@example.com');
    expect(res).toEqual({ ok: true, message: 'check_your_email' });
  });
});

describe('playerResetPassword', () => {
  it('POSTs token and password', async () => {
    fetchMock.mockResolvedValue(json({ user: sampleUser }));
    await playerResetPassword('reset-token', 'newpass12');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/reset-password',
      expect.objectContaining({
        body: JSON.stringify({ token: 'reset-token', password: 'newpass12' }),
      }),
    );
  });
});

describe('playerLogout', () => {
  it('POSTs logout with credentials', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await playerLogout();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: '{}',
      }),
    );
  });
});
