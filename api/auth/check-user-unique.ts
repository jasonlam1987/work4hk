const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const BACKEND_ORIGIN = 'http://119.91.50.192';
const DEFAULT_LIMIT = 2000;

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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const body = await readBody(req);
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const excludeUserId = String(body?.excludeUserId || '').trim();

  if (!username && !email) return json(res, 400, { error: 'username or email required' });

  const token =
    (process.env.AUTH_PRECHECK_TOKEN ? String(process.env.AUTH_PRECHECK_TOKEN) : '') ||
    (req.headers?.['x-auth-precheck-token'] as string | undefined) ||
    '';
  if (!token) return json(res, 501, { error: 'Precheck is not configured' });

  try {
    const url = new URL(`${BACKEND_ORIGIN}/api/users`);
    url.searchParams.set('limit', String(DEFAULT_LIMIT));
    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`,
      },
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return json(res, 502, { error: 'Upstream precheck failed', status: upstream.status, detail: text });
    }

    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      return json(res, 502, { error: 'Upstream precheck failed', detail: 'Invalid JSON' });
    }

    const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    const filtered = list.filter((u: any) => String(u?.id || '') !== excludeUserId);

    const usernameExists = username
      ? filtered.some((u: any) => normalize(u?.username) === normalize(username))
      : false;
    const emailExists = email
      ? filtered.some((u: any) => normalize((u?.email || u?.mail || '')) === normalize(email))
      : false;

    return json(res, 200, { usernameExists, emailExists });
  } catch (e: any) {
    return json(res, 502, { error: 'Upstream precheck failed', detail: String(e?.message || e) });
  }
}
