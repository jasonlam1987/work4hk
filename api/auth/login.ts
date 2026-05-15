const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const BACKEND_ORIGIN = String(process.env.AUTH_BACKEND_ORIGIN || 'http://119.91.50.192').trim();
const DEFAULT_LIMIT = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalize = (v: any) => String(v || '').trim().toLowerCase();

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

const loginWithUsername = async (username: string, password: string) => {
  const resp = await fetch(`${BACKEND_ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const text = await resp.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: resp.ok, status: resp.status, data, text };
};

const resolveUsernameByEmail = async (email: string, token: string) => {
  const url = new URL(`${BACKEND_ORIGIN}/api/users`);
  url.searchParams.set('limit', String(DEFAULT_LIMIT));
  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`,
    },
  });
  const text = await resp.text();
  if (!resp.ok) return '';
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return '';
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  const matched = list.find((u: any) => normalize(u?.email || u?.mail || '') === normalize(email));
  return String(matched?.username || '').trim();
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  const body = await readBody(req);
  const identifier = String(body?.username || body?.identifier || '').trim();
  const password = String(body?.password || '');
  if (!identifier || !password) return json(res, 401, { code: 'AUTH_INVALID', error: '帳號或密碼錯誤' });

  try {
    const direct = await loginWithUsername(identifier, password);
    if (direct.ok && direct.data?.access_token) return json(res, 200, direct.data);
    if (direct.status >= 500) {
      return json(res, 502, {
        code: 'UPSTREAM_UNAVAILABLE',
        error: '登入服務暫時不可用',
        detail: `upstream_status=${direct.status}`,
      });
    }
    if (direct.status && direct.status !== 401) {
      return json(res, 502, {
        code: 'UPSTREAM_LOGIN_FAILED',
        error: '登入服務回應異常',
        detail: `upstream_status=${direct.status}`,
      });
    }

    const maybeEmail = EMAIL_RE.test(identifier);
    const precheckToken =
      (process.env.AUTH_PRECHECK_TOKEN ? String(process.env.AUTH_PRECHECK_TOKEN) : '') ||
      (req.headers?.['x-auth-precheck-token'] as string | undefined) ||
      '';

    if (maybeEmail && precheckToken) {
      const resolvedUsername = await resolveUsernameByEmail(identifier, precheckToken);
      if (resolvedUsername) {
        const retry = await loginWithUsername(resolvedUsername, password);
        if (retry.ok && retry.data?.access_token) return json(res, 200, retry.data);
        if (retry.status >= 500) {
          return json(res, 502, {
            code: 'UPSTREAM_UNAVAILABLE',
            error: '登入服務暫時不可用',
            detail: `upstream_status=${retry.status}`,
          });
        }
      }
    }

    return json(res, 401, { code: 'AUTH_INVALID', error: '帳號或密碼錯誤' });
  } catch {
    return json(res, 502, { code: 'UPSTREAM_UNAVAILABLE', error: '登入服務暫時不可用' });
  }
}

