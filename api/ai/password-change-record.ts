import { readJsonBody } from './_file_store.js';
import { recordPasswordChanged } from './_password_store.js';

const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const BACKEND_ORIGIN = String(process.env.BACKEND_ORIGIN || 'https://119.91.50.192').trim().replace(/\/+$/, '');
const BACKEND_HOST = String(process.env.BACKEND_HOST || '').trim();

try {
  const u = new URL(BACKEND_ORIGIN);
  const isIpV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(String(u.hostname || ''));
  if (u.protocol === 'https:' && isIpV4) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
} catch {}

const getBearer = (req: any) => {
  const raw = String(req?.headers?.authorization || '').trim();
  if (!raw) return '';
  return raw.toLowerCase().startsWith('bearer ') ? raw : `Bearer ${raw}`;
};

const fetchMe = async (token: string) => {
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: token };
  if (BACKEND_HOST) headers.Host = BACKEND_HOST;
  const resp = await fetch(`${BACKEND_ORIGIN}/api/auth/me`, { method: 'GET', headers });
  const data = await resp.json().catch(() => null);
  return { ok: resp.ok, status: resp.status, data };
};

const isSuperAdminRole = (roleRaw: any) => {
  const role = String(roleRaw || '').trim().toLowerCase();
  return (
    role.includes('super_admin') ||
    role.includes('superadmin') ||
    role.includes('root') ||
    role.includes('超級管理員') ||
    role.includes('超级管理员')
  );
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
  const body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
  const requestedUsername = String(body?.username || '').trim();
  const role = String(me.data?.role_key ?? me.data?.role ?? '').trim();
  const canOverride = Boolean(requestedUsername && isSuperAdminRole(role));
  const username = canOverride ? requestedUsername : String(me.data?.username || '').trim();
  if (!username) return json(res, 400, { code: 'MISSING_USERNAME', error: 'missing username' });
  await recordPasswordChanged(username, Date.now());
  return json(res, 200, { ok: true });
}
