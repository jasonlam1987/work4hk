import { readJsonBody } from './_file_store.js';
import { computeMustChangePassword, loadPasswordPolicy, setRotationEpoch } from './_password_store.js';

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

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  const url = new URL(String(req.url || '/'), 'http://local');
  const token = getBearer(req);
  if (!token) return json(res, 401, { code: 'UNAUTHORIZED', error: 'unauthorized' });

  const me = await fetchMe(token);
  if (!me.ok) return json(res, 401, { code: 'UNAUTHORIZED', error: 'unauthorized' });
  const username = String(me.data?.username || '').trim();
  const role = normalizeRoleKey(me.data?.role_key ?? me.data?.role ?? '');
  const isSuper = isSuperAdminRole(role);

  if (req.method === 'GET') {
    const policy = await loadPasswordPolicy();
    const adminView = url.searchParams.get('admin') === '1';
    if (adminView) {
      if (!isSuper) return json(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
      return json(res, 200, {
        rotation_epoch_ms: policy.rotation_epoch_ms,
        updated_at: policy.updated_at,
        tracked_users: Object.keys(policy.user_last_changed_ms || {}).length,
      });
    }
    return json(res, 200, {
      rotation_epoch_ms: policy.rotation_epoch_ms,
      must_change_password: computeMustChangePassword(policy, username),
    });
  }

  if (req.method === 'POST') {
    if (!isSuper) return json(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
    const body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
    const rotationEpochMs = Number(body?.rotation_epoch_ms || Date.now());
    const next = await setRotationEpoch(rotationEpochMs);
    return json(res, 200, { ok: true, rotation_epoch_ms: next.rotation_epoch_ms });
  }

  return json(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
}

