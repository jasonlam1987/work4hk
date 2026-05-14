import { afterEach, describe, expect, it, vi } from 'vitest';
import loginHandler from './login';

const makeReq = (body: any, headers: Record<string, string> = {}) =>
  ({
    method: 'POST',
    body,
    headers,
  } as any);

const makeRes = () => {
  const state: any = { body: '' };
  return {
    state,
    statusCode: 0,
    setHeader: () => {},
    end: (val: string) => {
      state.body = val;
    },
  } as any;
};

describe('auth login API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supports username + password', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'token-u' }),
      })) as any
    );
    const req = makeReq({ username: 'admin', password: 'Passw0rd!' });
    const res = makeRes();
    await loginHandler(req, res);
    const body = JSON.parse(String(res.state.body || '{}'));
    expect(res.statusCode).toBe(200);
    expect(body.access_token).toBe('token-u');
  });

  it('supports email + password by resolving username', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ detail: 'Invalid username or password' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ id: 1, username: 'admin', email: 'info@est-hk.com' }]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'token-e' }),
      });
    vi.stubGlobal('fetch', fetchMock as any);
    const req = makeReq(
      { username: 'info@est-hk.com', password: 'Passw0rd!' },
      { 'x-auth-precheck-token': 'Bearer test-token' }
    );
    const res = makeRes();
    await loginHandler(req, res);
    const body = JSON.parse(String(res.state.body || '{}'));
    expect(res.statusCode).toBe(200);
    expect(body.access_token).toBe('token-e');
  });

  it('returns unified 401 for invalid credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ detail: 'Invalid username or password' }),
      })) as any
    );
    const req = makeReq({ username: 'bad@example.com', password: 'bad' });
    const res = makeRes();
    await loginHandler(req, res);
    const body = JSON.parse(String(res.state.body || '{}'));
    expect(res.statusCode).toBe(401);
    expect(body.code).toBe('AUTH_INVALID');
    expect(body.error).toBe('帳號或密碼錯誤');
  });
});

