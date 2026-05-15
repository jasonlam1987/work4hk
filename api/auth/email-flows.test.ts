import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const makeReq = (method: string, body: any = {}, query: Record<string, string> = {}) =>
  ({
    method,
    body,
    query,
    headers: {},
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

describe('auth email flows', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('completes registration after token verification', async () => {
    const tempRoot = path.join(os.tmpdir(), `work4hk-auth-test-${Date.now()}-register`);
    process.env.FILE_STORAGE_ROOT = tempRoot;
    process.env.AUTH_ADMIN_TOKEN = 'Bearer test-admin-token';

    const { resetStorageReadyCacheForTest } = await import('../ai/_storage_root.js');
    const { createAuthFlow, resetAuthFlowStoreForTest, verifyAuthFlow } = await import('./_auth_common.js');
    await fs.rm(tempRoot, { recursive: true, force: true });
    resetStorageReadyCacheForTest();
    await resetAuthFlowStoreForTest();

    const { token } = await createAuthFlow('register', 'new.user@example.com');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ id: 1, username: 'admin', email: 'admin@example.com' }]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ id: 1, username: 'admin', email: 'admin@example.com' }]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 2, username: 'new.user' }),
      });
    vi.stubGlobal('fetch', fetchMock as any);

    const registerComplete = (await import('./register-complete.js')).default;
    const req = makeReq('POST', { token, password: 'Passw0rd', confirmPassword: 'Passw0rd' });
    const res = makeRes();
    await registerComplete(req, res);
    const body = JSON.parse(String(res.state.body || '{}'));

    expect(res.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.username).toBe('new.user');

    const verification = await verifyAuthFlow('register', token);
    expect(verification.ok).toBe(false);
  });

  it('confirms password reset for existing email user', async () => {
    const tempRoot = path.join(os.tmpdir(), `work4hk-auth-test-${Date.now()}-reset`);
    process.env.FILE_STORAGE_ROOT = tempRoot;
    process.env.AUTH_ADMIN_TOKEN = 'Bearer test-admin-token';

    const { resetStorageReadyCacheForTest } = await import('../ai/_storage_root.js');
    const { createAuthFlow, resetAuthFlowStoreForTest } = await import('./_auth_common.js');
    await fs.rm(tempRoot, { recursive: true, force: true });
    resetStorageReadyCacheForTest();
    await resetAuthFlowStoreForTest();

    const { token } = await createAuthFlow('reset', 'worker@example.com');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ id: 9, username: 'worker.demo', email: 'worker@example.com' }]),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      });
    vi.stubGlobal('fetch', fetchMock as any);

    const resetConfirm = (await import('./password-reset-confirm.js')).default;
    const req = makeReq('POST', { token, password: 'NextPass1', confirmPassword: 'NextPass1' });
    const res = makeRes();
    await resetConfirm(req, res);
    const body = JSON.parse(String(res.state.body || '{}'));

    expect(res.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.email).toBe('worker@example.com');
  });
});
