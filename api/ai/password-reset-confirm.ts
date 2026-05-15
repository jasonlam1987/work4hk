import { readJsonBody } from './_file_store.js';
import { verifyPasswordResetToken } from './_password_reset_token.js';
import { consumePasswordResetToken, recordPasswordChanged } from './_password_store.js';

const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const BACKEND_ORIGIN = String(process.env.BACKEND_ORIGIN || 'https://119.91.50.192').trim().replace(/\/+$/, '');
const BACKEND_HOST = String(process.env.BACKEND_HOST || '').trim();
const DEFAULT_LIMIT = 2000;

try {
  const u = new URL(BACKEND_ORIGIN);
  const isIpV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(String(u.hostname || ''));
  if (u.protocol === 'https:' && isIpV4) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
} catch {}

const isStrongPassword = (v: string) => {
  if (v.length < 8) return false;
  if (!/[a-z]/.test(v)) return false;
  if (!/\d/.test(v)) return false;
  return true;
};

const normalize = (v: any) => String(v || '').trim().toLowerCase();

const getServiceToken = () => {
  const raw = String(process.env.AUTH_ADMIN_TOKEN || process.env.AUTH_PRECHECK_TOKEN || '').trim();
  if (!raw) return '';
  return raw.toLowerCase().startsWith('bearer ') ? raw : `Bearer ${raw}`;
};

const baseHeaders = (token: string) => {
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: token };
  if (BACKEND_HOST) headers.Host = BACKEND_HOST;
  return headers;
};

const fetchUsers = async (token: string) => {
  const resp = await fetch(`${BACKEND_ORIGIN}/api/users?limit=${DEFAULT_LIMIT}`, { method: 'GET', headers: baseHeaders(token) });
  const data = await resp.json().catch(() => null);
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  return { ok: resp.ok, status: resp.status, list };
};

const patchUserPassword = async (token: string, userId: string | number, newPassword: string) => {
  const headers: Record<string, string> = { ...baseHeaders(token), 'Content-Type': 'application/json' };
  const resp = await fetch(`${BACKEND_ORIGIN}/api/users/${userId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ password: newPassword }),
  });
  const text = await resp.text().catch(() => '');
  return { ok: resp.ok, status: resp.status, text };
};

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });

  const body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
  const tokenRaw = String(body?.token || '').trim();
  const newPassword = String(body?.newPassword || '');

  if (!tokenRaw || !newPassword) return json(res, 400, { code: 'MISSING_REQUIRED', error: 'missing required fields' });
  if (!isStrongPassword(newPassword)) return json(res, 400, { code: 'WEAK_PASSWORD', error: 'WEAK_PASSWORD' });

  const verified = verifyPasswordResetToken(tokenRaw);
  if (!verified.ok) return json(res, 400, { code: 'INVALID_TOKEN', error: verified.reason });

  const consumed = await consumePasswordResetToken(verified.payload.jti);
  if (!consumed.ok) return json(res, 400, { code: 'TOKEN_NOT_USABLE', error: consumed.reason });
  if (normalize(consumed.item.username) !== normalize(verified.payload.username)) {
    return json(res, 400, { code: 'TOKEN_MISMATCH', error: 'TOKEN_MISMATCH' });
  }

  const adminToken = getServiceToken();
  if (!adminToken) return json(res, 500, { code: 'CONFIG_MISSING', error: 'AUTH_ADMIN_TOKEN missing' });

  const users = await fetchUsers(adminToken);
  if (!users.ok) return json(res, 502, { code: 'FETCH_USERS_FAILED', error: 'fetch users failed' });
  const target = users.list.find((u: any) => normalize(u?.username || '') === normalize(verified.payload.username));
  if (!target?.id) return json(res, 404, { code: 'USER_NOT_FOUND', error: 'user not found' });

  const patched = await patchUserPassword(adminToken, target.id, newPassword);
  if (!patched.ok) return json(res, patched.status || 502, { code: 'CHANGE_PASSWORD_FAILED', error: 'change password failed', detail: patched.text });

  await recordPasswordChanged(verified.payload.username, Date.now());
  return json(res, 200, { ok: true });
}

