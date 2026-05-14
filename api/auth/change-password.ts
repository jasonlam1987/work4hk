const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const BACKEND_ORIGIN = 'http://119.91.50.192';
const DEFAULT_LIMIT = 2000;

const isStrongPassword = (v: string) => {
  if (v.length < 8) return false;
  if (!/[A-Z]/.test(v)) return false;
  if (!/[a-z]/.test(v)) return false;
  if (!/\d/.test(v)) return false;
  if (!/[^A-Za-z0-9]/.test(v)) return false;
  return true;
};

const readBody = async (req: any) => {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve());
  });
  try {
    const raw = Buffer.concat(chunks).toString('utf-8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  const body = await readBody(req);
  const username = String(body?.username || '').trim();
  const oldPassword = String(body?.oldPassword || '');
  const newPassword = String(body?.newPassword || '');
  const forceReset = Boolean(body?.forceReset);

  if (!username || !newPassword) return json(res, 400, { error: 'Missing required fields' });
  if (!isStrongPassword(newPassword)) return json(res, 400, { error: 'WEAK_PASSWORD' });

  try {
    const authToken = String(req.headers?.authorization || '').trim();
    if (!authToken) return json(res, 401, { error: 'UNAUTHORIZED' });
    const token = authToken.toLowerCase().startsWith('bearer ') ? authToken : `Bearer ${authToken}`;

    if (forceReset) {
      const meRes = await fetch(`${BACKEND_ORIGIN}/api/auth/me`, {
        method: 'GET',
        headers: { Authorization: token },
      });
      const me = await meRes.json().catch(() => null);
      const role = String(me?.role_key || me?.role || '').toLowerCase();
      const isSuper =
        role.includes('super_admin') ||
        role.includes('superadmin') ||
        role.includes('root') ||
        role.includes('超級管理員') ||
        role.includes('超级管理员');
      if (!meRes.ok || !isSuper) return json(res, 403, { error: 'FORBIDDEN' });
    } else {
      if (!oldPassword) return json(res, 400, { error: 'Missing required fields' });
      const loginRes = await fetch(`${BACKEND_ORIGIN}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: oldPassword }),
      });
      const loginData = await loginRes.json().catch(() => null);
      if (!loginRes.ok || !loginData?.access_token) return json(res, 401, { error: 'OLD_PASSWORD_INVALID' });
    }

    const usersRes = await fetch(`${BACKEND_ORIGIN}/api/users?limit=${DEFAULT_LIMIT}`, {
      method: 'GET',
      headers: { Authorization: token },
    });
    const usersData = await usersRes.json().catch(() => null);
    if (!usersRes.ok) return json(res, 502, { error: 'FETCH_USERS_FAILED' });
    const users = Array.isArray(usersData) ? usersData : Array.isArray(usersData?.items) ? usersData.items : [];
    const target = users.find((u: any) => String(u?.username || '').trim() === username);
    if (!target?.id) return json(res, 404, { error: 'USER_NOT_FOUND' });

    const patchRes = await fetch(`${BACKEND_ORIGIN}/api/users/${target.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify({ password: newPassword }),
    });
    const patchData = await patchRes.text();
    if (!patchRes.ok) return json(res, patchRes.status || 502, { error: 'CHANGE_PASSWORD_FAILED', detail: patchData });
    return json(res, 200, { ok: true });
  } catch (e: any) {
    return json(res, 500, { error: 'CHANGE_PASSWORD_FAILED', detail: String(e?.message || e) });
  }
}
