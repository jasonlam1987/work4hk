import { getBackendHost, upstreamFetch } from '../_upstream';

const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

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
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const backendHost = getBackendHost();
  if (backendHost) headers.Host = backendHost;

  const resp = await upstreamFetch('/api/auth/login', {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password }),
  });
  const text = await resp.text();
  const data: any = safeJsonParse(text);
  return { ok: resp.ok, status: resp.status, data, text };
};

const resolveUsernameByEmail = async (email: string, token: string) => {
  const headers: Record<string, string> = {
    Authorization: token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`,
    Accept: 'application/json',
  };
  const backendHost = getBackendHost();
  if (backendHost) headers.Host = backendHost;

  const resp = await upstreamFetch(`/api/users?limit=${DEFAULT_LIMIT}`, {
    method: 'GET',
    headers,
  });
  const text = await resp.text();
  if (!resp.ok) return '';
  const data: any = safeJsonParse(text);
  if (!data) return '';
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
  } catch (e: any) {
    return json(res, 502, {
      code: 'AUTH_UPSTREAM_UNAVAILABLE',
      error: '登入服務暫時不可用，請稍後再試',
      detail: String(e?.message || e),
    });
  }
}

