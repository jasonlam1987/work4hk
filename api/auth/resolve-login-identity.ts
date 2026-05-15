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
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
  if (!identifier) return json(res, 400, { error: 'Invalid identifier' });

  const token =
    (process.env.AUTH_PRECHECK_TOKEN ? String(process.env.AUTH_PRECHECK_TOKEN) : '') ||
    (req.headers?.['x-auth-precheck-token'] as string | undefined) ||
    '';
  if (!token) return json(res, 501, { error: 'Precheck is not configured' });

  const isEmail = identifier.includes('@');
  if (!isEmail) return json(res, 200, { loginUsername: identifier, mode: 'username', resolved: true });

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
    const data = text ? JSON.parse(text) : null;
    const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    const matched = list.find((u: any) => normalize((u?.email || u?.mail || '')) === normalize(identifier));
    if (!matched?.username) return json(res, 404, { error: 'EMAIL_NOT_FOUND' });
    return json(res, 200, { loginUsername: String(matched.username), mode: 'email', resolved: true });
  } catch (e: any) {
    return json(res, 502, { error: 'Upstream precheck failed', detail: String(e?.message || e) });
  }
}
