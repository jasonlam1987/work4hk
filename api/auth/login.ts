const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const BACKEND_ORIGIN = String(process.env.BACKEND_ORIGIN || 'http://119.91.50.192').trim();
const DEFAULT_LIMIT = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalize = (v: any) => String(v || '').trim().toLowerCase();

const safeJsonParse = (text: string) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

const pickToken = (data: any): string => {
  const token =
    data?.access_token ||
    data?.token ||
    data?.accessToken ||
    data?.jwt ||
    data?.data?.access_token ||
    data?.data?.token ||
    data?.data?.accessToken ||
    data?.data?.jwt ||
    '';
  return String(token || '').trim();
};

const normalizeLoginResponse = (data: any) => {
  const token = pickToken(data);
  if (!token) return null;
  if (data?.access_token) return data;
  const user = data?.user || data?.data?.user;
  return user ? { access_token: token, user } : { access_token: token };
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

const loginUpstream = async (identifier: string, password: string) => {
  const paths = ['/api/auth/login', '/api/auth/local', '/auth/login'];
  const body = { username: identifier, identifier, email: identifier, password };

  let last: any = null;
  for (const p of paths) {
    const resp = await fetch(`${BACKEND_ORIGIN}${p}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    const data = safeJsonParse(text);
    const normalized = normalizeLoginResponse(data);
    last = { ok: resp.ok, status: resp.status, data, text };
    if (resp.ok && normalized) return { ok: true, status: resp.status, data: normalized, text };
    if (resp.ok && data) return { ok: true, status: resp.status, data, text };
    if (resp.status === 400 || resp.status === 401 || resp.status === 403) return last;
  }

  return last || { ok: false, status: 0, data: null, text: '' };
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
    const direct = await loginUpstream(identifier, password);
    if (direct.ok && pickToken(direct.data)) return json(res, 200, direct.data);

    const maybeEmail = EMAIL_RE.test(identifier);
    const precheckToken =
      (process.env.AUTH_PRECHECK_TOKEN ? String(process.env.AUTH_PRECHECK_TOKEN) : '') ||
      (req.headers?.['x-auth-precheck-token'] as string | undefined) ||
      '';

    if (maybeEmail && precheckToken) {
      const resolvedUsername = await resolveUsernameByEmail(identifier, precheckToken);
      if (resolvedUsername) {
        const retry = await loginUpstream(resolvedUsername, password);
        if (retry.ok && pickToken(retry.data)) return json(res, 200, retry.data);
      }
    }

    const upstreamStatus = Number(direct?.status || 0);
    const looksLikeUpstreamUnavailable = upstreamStatus === 404 || upstreamStatus >= 500 || upstreamStatus === 0;
    if (looksLikeUpstreamUnavailable) {
      return json(res, 502, {
        code: 'AUTH_UPSTREAM_UNAVAILABLE',
        error: '登入服務暫時不可用，請稍後再試',
        upstream_status: upstreamStatus || undefined,
      });
    }

    return json(res, 401, { code: 'AUTH_INVALID', error: '帳號或密碼錯誤' });
  } catch {
    return json(res, 502, { code: 'AUTH_UPSTREAM_UNAVAILABLE', error: '登入服務暫時不可用，請稍後再試' });
  }
}
