import { readJsonBody } from './_file_store.js';
import { createPasswordResetToken } from './_password_reset_token.js';
import { registerPasswordResetToken } from './_password_store.js';

const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const BACKEND_ORIGIN = String(process.env.BACKEND_ORIGIN || 'https://119.91.50.192').trim().replace(/\/+$/, '');
const BACKEND_HOST = String(process.env.BACKEND_HOST || '').trim();
const DEFAULT_LIMIT = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

try {
  const u = new URL(BACKEND_ORIGIN);
  const isIpV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(String(u.hostname || ''));
  if (u.protocol === 'https:' && isIpV4) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
} catch {}

const normalizeRoleKey = (roleRaw: any) => String(roleRaw || '').trim().toLowerCase();

const isSuperAdminRole = (roleRaw: any) => {
  const role = normalizeRoleKey(roleRaw);
  return (
    role.includes('super_admin') ||
    role.includes('superadmin') ||
    role.includes('root') ||
    role.includes('超級管理員') ||
    role.includes('超级管理员')
  );
};

const normalize = (v: any) => String(v || '').trim().toLowerCase();

const getBearer = (req: any) => {
  const raw = String(req?.headers?.authorization || '').trim();
  if (!raw) return '';
  return raw.toLowerCase().startsWith('bearer ') ? raw : `Bearer ${raw}`;
};

const baseHeaders = (token: string) => {
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: token };
  if (BACKEND_HOST) headers.Host = BACKEND_HOST;
  return headers;
};

const fetchMe = async (token: string) => {
  const resp = await fetch(`${BACKEND_ORIGIN}/api/auth/me`, { method: 'GET', headers: baseHeaders(token) });
  const data = await resp.json().catch(() => null);
  return { ok: resp.ok, status: resp.status, data };
};

const fetchUsers = async (token: string) => {
  const resp = await fetch(`${BACKEND_ORIGIN}/api/users?limit=${DEFAULT_LIMIT}`, { method: 'GET', headers: baseHeaders(token) });
  const data = await resp.json().catch(() => null);
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  return { ok: resp.ok, status: resp.status, list };
};

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });

  const token = getBearer(req);
  if (!token) return json(res, 401, { code: 'UNAUTHORIZED', error: 'unauthorized' });

  const me = await fetchMe(token);
  if (!me.ok) return json(res, 401, { code: 'UNAUTHORIZED', error: 'unauthorized' });
  const role = normalizeRoleKey(me.data?.role_key ?? me.data?.role ?? '');
  if (!isSuperAdminRole(role)) return json(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });

  const body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
  const identifier = String(body?.identifier || body?.username || body?.email || '').trim();
  const ttlSec = body?.ttlSec != null ? Number(body.ttlSec) : undefined;
  if (!identifier) return json(res, 400, { code: 'MISSING_IDENTIFIER', error: 'missing identifier' });

  const users = await fetchUsers(token);
  if (!users.ok) return json(res, 502, { code: 'FETCH_USERS_FAILED', error: 'fetch users failed' });

  let resolvedUsername = '';
  if (EMAIL_RE.test(identifier)) {
    const matched = users.list.find((u: any) => normalize(u?.email || u?.mail || '') === normalize(identifier));
    resolvedUsername = String(matched?.username || '').trim();
  } else {
    const matched = users.list.find((u: any) => normalize(u?.username || '') === normalize(identifier));
    resolvedUsername = String(matched?.username || '').trim();
  }

  if (!resolvedUsername) return json(res, 404, { code: 'USER_NOT_FOUND', error: 'user not found' });

  const { token: resetToken, payload } = createPasswordResetToken({ username: resolvedUsername, ttlSec });
  await registerPasswordResetToken({
    jti: payload.jti,
    username: payload.username,
    exp_ms: payload.exp_ms,
    created_at: new Date().toISOString(),
  });

  return json(res, 200, { ok: true, token: resetToken, expires_at: new Date(payload.exp_ms).toISOString() });
}

