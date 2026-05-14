import { afterEach, describe, expect, it, vi } from 'vitest';
import proxyHandler from './[...path]';

const makeReq = (url: string, method: string, headers: Record<string, any> = {}, body?: any) =>
  ({
    url,
    method,
    headers,
    body,
    on: () => {},
  } as any);

const makeRes = () => {
  const state: any = { body: Buffer.from(''), headers: {}, statusCode: 0 };
  return {
    state,
    statusCode: 0,
    setHeader: (k: string, v: any) => {
      state.headers[String(k).toLowerCase()] = v;
    },
    end: (val: any) => {
      state.body = Buffer.isBuffer(val) ? val : Buffer.from(String(val || ''), 'utf-8');
    },
  } as any;
};

describe('api proxy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BACKEND_ORIGIN;
  });

  it('proxies /api/* to backend /api/*', async () => {
    process.env.BACKEND_ORIGIN = 'https://backend.example';
    const fetchMock = vi.fn(async (url: any) => ({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      arrayBuffer: async () => Buffer.from(JSON.stringify({ ok: true }), 'utf-8'),
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    const req = makeReq('/api/users?limit=1', 'GET', { authorization: 'Bearer t' });
    const res = makeRes();
    await proxyHandler(req, res);

    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://backend.example/api/users?limit=1');
    expect(res.statusCode).toBe(200);
    expect(res.state.headers['content-type']).toContain('application/json');
    expect(JSON.parse(res.state.body.toString('utf-8')).ok).toBe(true);
  });

  it('avoids double /api when BACKEND_ORIGIN ends with /api', async () => {
    process.env.BACKEND_ORIGIN = 'https://backend.example/api';
    const fetchMock = vi.fn(async (url: any) => ({
      status: 200,
      headers: new Headers({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    const req = makeReq('/api/auth/me', 'GET');
    const res = makeRes();
    await proxyHandler(req, res);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://backend.example/api/auth/me');
  });
});

